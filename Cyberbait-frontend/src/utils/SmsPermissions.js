import {Platform, PermissionsAndroid, Alert, Linking} from 'react-native';
import {NativeModules} from 'react-native';

/**
 * Utility module for handling SMS-related Android permissions.
 * All methods are platform-guarded and return safe no-ops on iOS.
 */

/**
 * Check if SMS permissions are currently granted.
 * @returns {Promise<boolean>}
 */
export const checkSmsPermission = async () => {
  if (Platform.OS !== 'android') return false;

  try {
    // Use the native module check if available
    if (NativeModules.SmsModule?.checkSmsPermission) {
      return await NativeModules.SmsModule.checkSmsPermission();
    }

    // Fallback to PermissionsAndroid API
    const receiveGranted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
    );
    const readGranted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.READ_SMS,
    );
    return receiveGranted && readGranted;
  } catch (error) {
    console.warn('[SmsPermissions] Error checking permission:', error);
    return false;
  }
};

/**
 * Request SMS permissions with a user-friendly rationale dialog.
 * @returns {Promise<boolean>} Whether permission was granted
 */
export const requestSmsPermission = async () => {
  if (Platform.OS !== 'android') return false;

  try {
    const granted = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
      PermissionsAndroid.PERMISSIONS.READ_SMS,
    ]);

    const receiveGranted =
      granted[PermissionsAndroid.PERMISSIONS.RECEIVE_SMS] ===
      PermissionsAndroid.RESULTS.GRANTED;
    const readGranted =
      granted[PermissionsAndroid.PERMISSIONS.READ_SMS] ===
      PermissionsAndroid.RESULTS.GRANTED;

    if (receiveGranted && readGranted) {
      return true;
    }

    // Check if user selected "Never ask again"
    const receiveNever =
      granted[PermissionsAndroid.PERMISSIONS.RECEIVE_SMS] ===
      PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;
    const readNever =
      granted[PermissionsAndroid.PERMISSIONS.READ_SMS] ===
      PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;

    if (receiveNever || readNever) {
      Alert.alert(
        'Permission Required',
        'SMS permissions are required for auto-scan. Please enable them in app settings.',
        [
          {text: 'Cancel', style: 'cancel'},
          {text: 'Open Settings', onPress: () => Linking.openSettings()},
        ],
      );
    }

    return false;
  } catch (error) {
    console.error('[SmsPermissions] Error requesting permission:', error);
    return false;
  }
};

/**
 * Persist the auto-scan preference in the native layer so the SMS receiver can
 * decide whether to queue messages while React Native is not active.
 *
 * @param {boolean} enabled
 * @returns {Promise<boolean>}
 */
export const setSmsAutoScanEnabled = async enabled => {
  if (Platform.OS !== 'android') return false;

  try {
    if (NativeModules.SmsModule?.setAutoScanEnabled) {
      await NativeModules.SmsModule.setAutoScanEnabled(Boolean(enabled));
    }
    return true;
  } catch (error) {
    console.warn('[SmsPermissions] Error syncing native auto-scan:', error);
    return false;
  }
};

/**
 * Check whether the notification-listener fallback is enabled. This is useful
 * on Realme/ColorOS devices where SMS broadcasts can be delayed by OEM policy.
 *
 * @returns {Promise<boolean>}
 */
export const checkSmsNotificationAccess = async () => {
  if (Platform.OS !== 'android') return false;

  try {
    if (NativeModules.SmsModule?.isNotificationListenerEnabled) {
      return await NativeModules.SmsModule.isNotificationListenerEnabled();
    }
    return false;
  } catch (error) {
    console.warn('[SmsPermissions] Error checking notification access:', error);
    return false;
  }
};

export const requestSmsNotificationAccess = () => {
  return new Promise(resolve => {
    if (Platform.OS !== 'android') {
      resolve(false);
      return;
    }

    Alert.alert(
      'Notification Access Required',
      'To enable the fallback detector (essential for Realme/Android 13+), please allow Notification Access for CyberBait in the next screen.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: 'Open Settings',
          onPress: async () => {
            try {
              if (NativeModules.SmsModule?.openNotificationListenerSettings) {
                await NativeModules.SmsModule.openNotificationListenerSettings();
              } else {
                await Linking.sendIntent(
                  'android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS',
                );
              }
            } catch (error) {
              console.warn(
                '[SmsPermissions] Error opening notification access:',
                error,
              );
              try {
                await Linking.openSettings();
              } catch (e) {}
            }
            resolve(true);
          },
        },
      ],
    );
  });
};

/**
 * Prompt for Android background reliability settings. Realme UI/ColorOS can
 * suppress background receivers unless battery and auto-start settings are
 * relaxed by the user.
 */
export const promptForSmsBackgroundReliability = async () => {
  if (Platform.OS !== 'android') return;

  const {SmsModule} = NativeModules;
  if (!SmsModule?.isIgnoringBatteryOptimizations) return;

  try {
    const deviceInfo = await SmsModule.getDeviceRestrictionInfo?.();
    const alreadyAllowed = await SmsModule.isIgnoringBatteryOptimizations();
    const notificationFallbackEnabled =
      await SmsModule.isNotificationListenerEnabled?.();

    if (alreadyAllowed && notificationFallbackEnabled) return;

    const manufacturer = deviceInfo?.manufacturer || 'this device';
    const isRealmeFamily = Boolean(deviceInfo?.isRealmeFamily);
    const message = isRealmeFamily
      ? `${manufacturer} / Realme UI may block SMS auto-scan in the background. Allow battery background activity, enable auto-start, and turn on notification access for the fallback detector.`
      : 'Allow background activity and notification access so incoming SMS auto-scan stays reliable when the app is not open.';

    Alert.alert(
      'Improve SMS Auto-Scan',
      message,
      [
        {text: 'Later', style: 'cancel'},
        {
          text: 'Battery',
          onPress: () => {
            SmsModule.requestIgnoreBatteryOptimizations?.();
          },
        },
        {
          text: notificationFallbackEnabled ? 'Auto-start' : 'Fallback',
          onPress: () => {
            if (notificationFallbackEnabled) {
              SmsModule.openManufacturerAutoStartSettings?.();
            } else {
              SmsModule.openNotificationListenerSettings?.();
            }
          },
        },
      ],
    );
  } catch (error) {
    console.warn('[SmsPermissions] Error opening battery settings:', error);
  }
};
