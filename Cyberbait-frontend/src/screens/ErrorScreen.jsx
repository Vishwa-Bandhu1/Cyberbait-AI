import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import ScreenWrapper from '../components/ScreenWrapper';
import NeonButton from '../components/NeonButton';
import {COLORS} from '../theme';

const ErrorScreen = ({route, navigation}) => {
  const {errorType, errorMessage, retryParams} = route.params || {};

  const getErrorInfo = () => {
    switch (errorType) {
      case 'OCR_FAILED':
        return {
          icon: '📷',
          title: 'OCR Failed',
          description: 'We couldn\'t extract text from the image. Please try a clearer image.',
        };
      case 'NETWORK_ERROR':
      case 'ERR_NETWORK':
        return {
          icon: '📡',
          title: 'No Connection',
          description: 'Unable to reach the server. Please check your internet connection and try again.',
        };
      case 'TIMEOUT':
        return {
          icon: '⏱️',
          title: 'Request Timeout',
          description: 'The analysis is taking too long. Please try again.',
        };
      default:
        return {
          icon: '⚠️',
          title: 'Analysis Failed',
          description: errorMessage || 'Something went wrong. Please try again.',
        };
    }
  };

  const errorInfo = getErrorInfo();

  const handleRetry = () => {
    if (retryParams) {
      navigation.replace('Processing', retryParams);
    } else {
      navigation.navigate('MainTabs', { screen: 'Scan' });
    }
  };

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        {/* Error visualization */}
        <View style={styles.iconContainer}>
          <View style={styles.iconOuter} />
          <View style={styles.iconMiddle} />
          <View style={styles.iconInner}>
            <Text style={styles.icon}>{errorInfo.icon}</Text>
          </View>
        </View>

        {/* Error text */}
        <Text style={styles.title}>{errorInfo.title}</Text>
        <Text style={styles.description}>{errorInfo.description}</Text>

        {/* Error code */}
        <View style={styles.errorCodeContainer}>
          <Text style={styles.errorCodeLabel}>Error Code</Text>
          <Text style={styles.errorCode}>{errorType || 'UNKNOWN'}</Text>
        </View>

        {/* Actions */}
        <NeonButton
          title="🔄 Retry"
          onPress={handleRetry}
          style={styles.retryBtn}
        />
        <NeonButton
          title="🏠 Go Home"
          variant="outline"
          onPress={() => navigation.navigate('MainTabs', { screen: 'Home' })}
          style={styles.homeBtn}
        />
      </View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  iconContainer: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  iconOuter: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255, 59, 48, 0.05)',
  },
  iconMiddle: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 59, 48, 0.08)',
  },
  iconInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 36,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.danger,
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  errorCodeContainer: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.2)',
    marginBottom: 32,
  },
  errorCodeLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 4,
  },
  errorCode: {
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    fontFamily: 'monospace',
    letterSpacing: 1,
  },
  retryBtn: {
    width: '100%',
    marginBottom: 12,
  },
  homeBtn: {
    width: '100%',
  },
});

export default ErrorScreen;
