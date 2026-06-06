import { useEffect, useRef, useCallback } from 'react';
import { AppState, Platform } from 'react-native';
import SmsAndroid from 'react-native-get-sms-android';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkSmsPermission } from '../utils/SmsPermissions';

const PROCESSED_IDS_KEY = '@processed_sms_ids';
const MAX_PROCESSED_HISTORY = 50;
const POLL_INTERVAL_MS = 5000;

/**
 * Custom React hook that acts as the PRIMARY SMS detection mechanism.
 * It directly polls the device inbox using react-native-get-sms-android,
 * bypassing OEM notification listener restrictions.
 *
 * @param {function} onSmsDetected - Callback fired with new SMS data
 * @param {boolean} enabled - Whether polling is active
 */
const useSmsInboxSync = (onSmsDetected, enabled = true) => {
  const callbackRef = useRef(onSmsDetected);
  const processedIdsRef = useRef(new Set());
  const isPollingRef = useRef(false);

  // Keep callback fresh
  useEffect(() => {
    callbackRef.current = onSmsDetected;
  }, [onSmsDetected]);

  // Load processed history from storage on mount to prevent
  // re-scanning old messages on app restart.
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const stored = await AsyncStorage.getItem(PROCESSED_IDS_KEY);
        if (stored) {
          const idsArray = JSON.parse(stored);
          processedIdsRef.current = new Set(idsArray);
        }
      } catch (e) {
        console.warn('[useSmsInboxSync] Failed to load processed IDs:', e);
      }
    };
    loadHistory();
  }, []);

  const saveHistory = async () => {
    try {
      const arr = Array.from(processedIdsRef.current).slice(-MAX_PROCESSED_HISTORY);
      await AsyncStorage.setItem(PROCESSED_IDS_KEY, JSON.stringify(arr));
    } catch (e) {
      console.warn('[useSmsInboxSync] Failed to save processed IDs:', e);
    }
  };

  const syncInbox = useCallback(async () => {
    if (!enabled || isPollingRef.current || Platform.OS !== 'android') return;
    
    isPollingRef.current = true;
    
    try {
      const hasPermission = await checkSmsPermission();
      if (!hasPermission) {
        isPollingRef.current = false;
        return;
      }

      // Fetch the latest 10 messages from the inbox
      const filter = {
        box: 'inbox',
        maxCount: 10,
      };

      SmsAndroid.list(
        JSON.stringify(filter),
        (fail) => {
          console.warn('[useSmsInboxSync] Failed to fetch SMS:', fail);
          isPollingRef.current = false;
        },
        (count, smsListStr) => {
          try {
            const smsList = JSON.parse(smsListStr);
            if (!smsList || smsList.length === 0) {
              isPollingRef.current = false;
              return;
            }

            // Find messages we haven't processed yet
            // Sort ascending by date so older missed messages are processed first
            const newMessages = smsList
              .filter(sms => !processedIdsRef.current.has(sms._id))
              .sort((a, b) => a.date - b.date);

            if (newMessages.length > 0) {
              newMessages.forEach(sms => {
                processedIdsRef.current.add(sms._id);
                
                // Prevent memory leak from growing Set
                if (processedIdsRef.current.size > MAX_PROCESSED_HISTORY * 2) {
                  const arr = Array.from(processedIdsRef.current).slice(-MAX_PROCESSED_HISTORY);
                  processedIdsRef.current = new Set(arr);
                }

                console.log(`[useSmsInboxSync] New SMS detected via inbox sync: ID ${sms._id} from ${sms.address}`);
                
                if (callbackRef.current) {
                  callbackRef.current({
                    id: sms._id,
                    sender: sms.address,
                    message: sms.body,
                    timestamp: sms.date,
                    source: 'inbox_sync'
                  });
                }
              });
              
              saveHistory();
            }
          } catch (e) {
            console.warn('[useSmsInboxSync] Error parsing SMS list:', e);
          }
          isPollingRef.current = false;
        }
      );
    } catch (e) {
      console.warn('[useSmsInboxSync] Unexpected error during sync:', e);
      isPollingRef.current = false;
    }
  }, [enabled]);

  // Foreground Polling Loop
  useEffect(() => {
    let intervalId;
    
    if (enabled) {
      // Sync immediately on mount/enable
      syncInbox();
      
      // Poll every 5 seconds while active
      intervalId = setInterval(() => {
        if (AppState.currentState === 'active') {
          syncInbox();
        }
      }, POLL_INTERVAL_MS);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [enabled, syncInbox]);

  // AppState change listener (e.g., coming from background to foreground)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active' && enabled) {
        console.log('[useSmsInboxSync] App returned to active, forcing sync');
        syncInbox();
      }
    });

    return () => subscription.remove();
  }, [enabled, syncInbox]);

  return { syncInbox };
};

export default useSmsInboxSync;
