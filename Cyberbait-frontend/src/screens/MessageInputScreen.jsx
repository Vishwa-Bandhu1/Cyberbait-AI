import React, {useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Alert,
  Keyboard,
  Platform,
  PermissionsAndroid,
  ActivityIndicator,
} from 'react-native';
import SmsAndroid from 'react-native-get-sms-android';
import {launchImageLibrary} from 'react-native-image-picker';
import ScreenWrapper from '../components/ScreenWrapper';
import GlassCard from '../components/GlassCard';
import NeonButton from '../components/NeonButton';
import RiskMeter from '../components/RiskMeter';
import {COLORS, SIZES} from '../theme';

/**
 * Request READ_SMS + RECEIVE_SMS permissions at runtime.
 * Returns true only when both are granted.
 */
const ensureSmsPermission = async () => {
  if (Platform.OS !== 'android') return false;

  try {
    const readStatus = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.READ_SMS,
    );
    const receiveStatus = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
    );

    if (readStatus && receiveStatus) {
      console.log('[SMS] Permissions already granted');
      return true;
    }

    console.log('[SMS] Requesting permissions...');
    const granted = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.READ_SMS,
      PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
    ]);

    const readGranted =
      granted[PermissionsAndroid.PERMISSIONS.READ_SMS] ===
      PermissionsAndroid.RESULTS.GRANTED;
    const receiveGranted =
      granted[PermissionsAndroid.PERMISSIONS.RECEIVE_SMS] ===
      PermissionsAndroid.RESULTS.GRANTED;

    console.log('[SMS] Permission result — READ:', readGranted, 'RECEIVE:', receiveGranted);

    if (!readGranted) {
      const neverAskRead =
        granted[PermissionsAndroid.PERMISSIONS.READ_SMS] ===
        PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;
      const neverAskReceive =
        granted[PermissionsAndroid.PERMISSIONS.RECEIVE_SMS] ===
        PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;

      if (neverAskRead || neverAskReceive) {
        Alert.alert(
          'SMS Permission Required',
          'SMS permission was permanently denied. Please enable it from Settings > Apps > CyberBait > Permissions.',
          [
            {text: 'Cancel', style: 'cancel'},
            {
              text: 'Open Settings',
              onPress: () => {
                const {Linking} = require('react-native');
                Linking.openSettings();
              },
            },
          ],
        );
      }
      return false;
    }

    return readGranted;
  } catch (error) {
    console.error('[SMS] Permission error:', error);
    return false;
  }
};

/**
 * Fetch the single most-recent SMS from the device inbox.
 * Returns a Promise that resolves to the SMS body string, or null on failure.
 * Includes a timeout to prevent silent hanging on Realme/Android 13 devices.
 */
const fetchLatestSms = () => {
  return new Promise(resolve => {
    let isResolved = false;
    let timeoutId;

    const finish = (result) => {
      if (isResolved) return;
      isResolved = true;
      if (timeoutId) clearTimeout(timeoutId);
      console.log(`[SMS] Fetch resolved with: ${result ? 'SUCCESS' : 'NULL'}`);
      resolve(result);
    };

    // Timeout fallback to prevent infinite loading
    timeoutId = setTimeout(() => {
      console.error('[SMS] Read timeout after 5000ms. Returning null.');
      finish(null);
    }, 5000);

    const filter = {
      box: 'inbox',
      maxCount: 1, // Only the very latest message
    };

    console.log('[SMS] Fetching latest inbox message...');

    SmsAndroid.list(
      JSON.stringify(filter),
      fail => {
        console.error('[SMS] Inbox read failed:', fail);
        finish(null);
      },
      (_count, smsListStr) => {
        try {
          const smsList = JSON.parse(smsListStr);
          console.log('[SMS] Inbox returned', smsList?.length, 'message(s)');

          if (!smsList || smsList.length === 0) {
            console.warn('[SMS] Inbox is empty');
            finish(null);
            return;
          }

          const latest = smsList[0];
          console.log(
            '[SMS] Latest SMS — from:',
            latest.address,
            '| length:',
            latest.body?.length,
            '| date:',
            new Date(latest.date).toLocaleString(),
          );

          if (!latest.body || !latest.body.trim()) {
            console.warn('[SMS] Latest SMS has no body text');
            finish(null);
            return;
          }

          finish({
            body: latest.body.trim(),
            sender: latest.address,
          });
        } catch (parseError) {
          console.error('[SMS] Parse error:', parseError);
          finish(null);
        }
      },
    );
  });
};

const MessageInputScreen = ({navigation}) => {
  const [message, setMessage] = useState('');
  const [isFetching, setIsFetching] = useState(false);

  const handleAnalyze = useCallback(async () => {
    console.log('[Analyze] Button Clicked: Starting analysis flow');
    
    // If user already typed a message, use it directly
    if (message.trim()) {
      console.log('[Analyze] Using user-typed message (' + message.trim().length + ' chars)');
      Keyboard.dismiss();
      console.log('[Analyze] Navigating to Processing screen with custom message...');
      navigation.navigate('Processing', {message: message.trim(), type: 'text'});
      return;
    }

    // Input is empty — auto-fetch the latest SMS
    console.log('[Analyze] Input empty, auto-fetching latest SMS...');
    setIsFetching(true);

    try {
      // Step 1: Ensure permissions
      console.log('[Analyze] Checking SMS permissions...');
      const hasPermission = await ensureSmsPermission();
      if (!hasPermission) {
        console.warn('[Analyze] SMS permission denied');
        Alert.alert(
          'Permission Required',
          'SMS read permission is needed to fetch your latest message. Please grant the permission and try again.',
        );
        setIsFetching(false);
        return;
      }
      console.log('[Analyze] SMS permissions granted.');

      // Step 2: Fetch the latest SMS
      console.log('[Analyze] Awaiting fetchLatestSms()...');
      const smsData = await fetchLatestSms();

      if (!smsData) {
        console.warn('[Analyze] No SMS found in inbox');
        Alert.alert(
          'No SMS Found',
          'Your SMS inbox appears to be empty or an error occurred. Please paste a message manually or try again after receiving an SMS.',
        );
        setIsFetching(false);
        return;
      }

      // Step 3: Fill the input field with the fetched SMS
      console.log(`[Analyze] SMS fetched successfully. Sender: ${smsData.sender}, Body Length: ${smsData.body.length}`);
      setMessage(smsData.body);

      // Step 4: Immediately trigger analysis (don't wait for re-render)
      console.log('[Analyze] Triggering Navigation to Processing screen...');
      Keyboard.dismiss();
      navigation.navigate('Processing', {
        message: smsData.body,
        sender: smsData.sender,
        type: 'text'
      });
    } catch (error) {
      console.error('[Analyze] Unexpected error during flow:', error);
      Alert.alert(
        'Error',
        'Failed to fetch SMS from inbox. Please paste the message manually.',
      );
    } finally {
      setIsFetching(false);
      console.log('[Analyze] Fetching sequence finished (isFetching set to false).');
    }
  }, [message, navigation]);

  const handleUploadScreenshot = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.8,
      });

      if (result.didCancel) return;

      if (result.errorCode) {
        Alert.alert('Error', result.errorMessage || 'Failed to pick image');
        return;
      }

      const imageFile = result.assets?.[0];
      if (imageFile) {
        navigation.navigate('Processing', {imageFile, type: 'image'});
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to open image picker');
    }
  };

  return (
    <ScreenWrapper>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.logoContainer}>
              <Text style={styles.logoEmoji}>🛡️</Text>
            </View>
            <Text style={styles.logo}>CYBERBAIT</Text>
          </View>
          <TouchableOpacity>
            <Text style={styles.bellIcon}>🔔</Text>
          </TouchableOpacity>
        </View>

        {/* Title */}
        <View style={styles.titleSection}>
          <Text style={styles.title}>Message</Text>
          <Text style={styles.titleGreen}>Intelligence</Text>
          <Text style={styles.subtitle}>
            Deploy advanced OCR and linguistic heuristics to scan suspicious
            communications for phishing signatures.
          </Text>
        </View>

        {/* Input Area */}
        <GlassCard style={styles.inputCard}>
          <View style={styles.inputHeader}>
            <View style={styles.inputLabel}>
              <View style={styles.inputDot} />
              <Text style={styles.inputLabelText}>INPUT STREAM</Text>
            </View>
          </View>
          <TextInput
            style={styles.textInput}
            placeholder="Paste suspicious message here..."
            placeholderTextColor={COLORS.textMuted}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            value={message}
            onChangeText={setMessage}
          />
        </GlassCard>

        {/* Action Buttons */}
        <NeonButton
          title={isFetching ? '📡 Fetching SMS...' : '⚡ Analyze Message'}
          onPress={handleAnalyze}
          style={styles.analyzeBtn}
          disabled={isFetching}
        />

        {isFetching && (
          <View style={styles.fetchingIndicator}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.fetchingText}>Reading latest SMS from inbox...</Text>
          </View>
        )}

        <NeonButton
          title="📸 Upload Screenshot"
          variant="outline"
          onPress={handleUploadScreenshot}
          style={styles.uploadBtn}
        />

        {/* Protocol Tips */}
        <GlassCard style={styles.tipsCard}>
          <View style={styles.tipsHeader}>
            <Text style={styles.tipsIcon}>🛡️</Text>
            <Text style={styles.tipsTitle}>Protocol Tips</Text>
          </View>
          <View style={styles.tipItem}>
            <View style={[styles.tipDot, {backgroundColor: COLORS.primary}]} />
            <Text style={styles.tipText}>
              Tap "Analyze Message" with an empty field to auto-fetch your latest SMS.
            </Text>
          </View>
          <View style={styles.tipItem}>
            <View style={[styles.tipDot, {backgroundColor: COLORS.primary}]} />
            <Text style={styles.tipText}>
              Screenshots are processed via local neural OCR layers.
            </Text>
          </View>
        </GlassCard>

        {/* Encrypted Badge */}
        <View style={styles.encryptedBadge}>
          <View style={styles.encryptedIcon}>
            <Text style={styles.lockEmoji}>🔒</Text>
          </View>
          <Text style={styles.encryptedText}>END-TO-END ENCRYPTED</Text>
        </View>

        {/* Threat Assessment Score */}
        <GlassCard style={styles.assessmentCard}>
          <Text style={styles.assessmentLabel}>ANALYSIS STANDBY</Text>
          <Text style={styles.assessmentTitle}>
            Threat Assessment{'\n'}Score
          </Text>
          <View style={styles.assessmentContent}>
            <RiskMeter score={0} size={100} />
            <View style={styles.assessmentStats}>
              <View style={styles.assessmentStat}>
                <View style={[styles.assessmentDot, {backgroundColor: COLORS.primary}]} />
                <Text style={styles.assessmentStatText}>Linguistic{'\n'}anomalies: 0</Text>
              </View>
              <View style={styles.assessmentStat}>
                <View style={[styles.assessmentDot, {backgroundColor: COLORS.danger}]} />
                <Text style={styles.assessmentStatText}>Malicious{'\n'}domains: 0</Text>
              </View>
            </View>
          </View>
        </GlassCard>

        <View style={{height: 120}} />
      </ScrollView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,255,65,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: COLORS.primaryGlow,
  },
  logoEmoji: {
    fontSize: 16,
  },
  logo: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: 1,
  },
  bellIcon: {
    fontSize: 20,
  },
  titleSection: {
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  titleGreen: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.primary,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 10,
    lineHeight: 22,
  },
  inputCard: {
    marginBottom: 16,
  },
  inputHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  inputLabel: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
    marginRight: 8,
  },
  inputLabelText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
  textInput: {
    backgroundColor: 'rgba(10, 14, 23, 0.5)',
    borderRadius: 12,
    padding: 16,
    color: COLORS.textPrimary,
    fontSize: 14,
    minHeight: 130,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 65, 0.08)',
  },
  analyzeBtn: {
    marginBottom: 12,
  },
  fetchingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  fetchingText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 8,
  },
  uploadBtn: {
    marginBottom: 20,
  },
  tipsCard: {
    marginBottom: 16,
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  tipsIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  tipsTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  tipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
    marginRight: 10,
  },
  tipText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    flex: 1,
    lineHeight: 20,
  },
  encryptedBadge: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  encryptedIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0,255,65,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  lockEmoji: {
    fontSize: 24,
  },
  encryptedText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 3,
  },
  assessmentCard: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  assessmentLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 3,
    marginBottom: 8,
  },
  assessmentTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: 20,
  },
  assessmentContent: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'space-around',
  },
  assessmentStats: {
    marginLeft: 16,
  },
  assessmentStat: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  assessmentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 4,
    marginRight: 8,
  },
  assessmentStatText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
});

export default MessageInputScreen;
