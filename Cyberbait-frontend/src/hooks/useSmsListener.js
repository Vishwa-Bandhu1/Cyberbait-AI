import {useEffect, useRef} from 'react';
import {NativeEventEmitter, NativeModules, Platform} from 'react-native';

const SMS_RECEIVED_EVENT = 'onSmsReceived';

/**
 * Custom React hook that listens for incoming SMS events
 * emitted by the native SmsModule.
 *
 * @param {function} onSmsReceived - Callback with {sender, message, timestamp}
 * @param {boolean} enabled - Whether the listener is active
 */
const useSmsListener = (onSmsReceived, enabled = true) => {
  const callbackRef = useRef(onSmsReceived);

  // Keep callback ref fresh without re-subscribing
  useEffect(() => {
    callbackRef.current = onSmsReceived;
  }, [onSmsReceived]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const {SmsModule} = NativeModules;

    const syncAutoScan = SmsModule?.setAutoScanEnabled?.(Boolean(enabled));
    syncAutoScan?.catch?.(error => {
      console.warn('[useSmsListener] Failed to sync auto-scan state:', error);
    });
  }, [enabled]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !enabled) return;

    const {SmsModule} = NativeModules;
    if (!SmsModule) {
      console.warn('[useSmsListener] SmsModule native module not found');
      return;
    }

    const eventEmitter = new NativeEventEmitter(SmsModule);
    const subscription = eventEmitter.addListener(SMS_RECEIVED_EVENT, event => {
      if (!event?.message) {
        console.warn('[useSmsListener] Ignoring malformed SMS event:', event);
        return;
      }

      console.log(
        '[useSmsListener] SMS received from:',
        event.sender,
        `(${event.message.length} chars)`,
        event.source ? `source=${event.source}` : '',
      );
      callbackRef.current?.(event);
    });

    return () => {
      subscription.remove();
    };
  }, [enabled]);
};

export default useSmsListener;
