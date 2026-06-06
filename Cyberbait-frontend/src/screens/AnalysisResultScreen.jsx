import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, NativeModules } from 'react-native';
import ScreenWrapper from '../components/ScreenWrapper';
import GlassCard from '../components/GlassCard';
import NeonButton from '../components/NeonButton';
import RiskMeter from '../components/RiskMeter';
import KeywordBadge from '../components/KeywordBadge';
import { COLORS } from '../theme';
import Svg, { Path, Circle } from 'react-native-svg';

const AnalysisResultScreen = ({ route, navigation }) => {
  const { result, sender } = route.params;
  const [isBlocking, setIsBlocking] = useState(false);

  // Determine the sender to block. If passed via navigation, use it.
  // Otherwise, if entities has phone numbers, use the first one.
  const senderToBlock = sender || (result.entities?.phoneNumbers?.[0]);

  const getThreatColor = () => {
    if (result.riskScore <= 40) return COLORS.riskLow;
    if (result.riskScore <= 60) return COLORS.riskMedium;
    if (result.riskScore <= 80) return COLORS.riskHigh;
    return COLORS.riskCritical;
  };

  const threatColor = getThreatColor();

  const handleBlockMessage = () => {
    if (!senderToBlock) {
      Alert.alert(
        'Sender Unavailable',
        'Could not determine the sender\'s phone number to block. This message might have been scanned from history or an image.',
      );
      return;
    }

    Alert.alert(
      'Block Sender',
      `Are you sure you want to block this sender (${senderToBlock})?\n\nAndroid will ask you to temporarily set Kinetic Vault as the default SMS app. After blocking, you can switch back.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: executeBlock,
        },
      ],
    );
  };

  const logBlockStatus = (label, status) => {
    if (!status) {
      console.log(`[Block] ${label}: status unavailable`);
      return;
    }

    console.log(
      `[Block] ${label}: canBlock=${Boolean(status.canBlockSender)} ` +
        `defaultSms=${Boolean(status.isDefaultSmsApp)} ` +
        `callScreening=${Boolean(status.hasCallScreeningRole)} ` +
        `api=${status.apiLevel} manufacturer=${status.manufacturer || 'unknown'}`,
    );
  };

  const showBlockFailure = message => {
    Alert.alert(
      'Block Failed',
      message ||
        'Could not block the sender. Please set Kinetic Vault as the default SMS app and try again.',
    );
  };

  const offerRestorePreviousSms = (blockResult) => {
    if (!blockResult?.canRestorePreviousSms) return;

    const { SmsModule } = NativeModules;
    if (!SmsModule?.restorePreviousDefaultSms) return;

    Alert.alert(
      'Restore Default SMS App?',
      'The sender has been blocked. Would you like to switch your default SMS app back to the previous one?',
      [
        {
          text: 'Keep Current',
          style: 'cancel',
        },
        {
          text: 'Restore',
          onPress: async () => {
            try {
              const result = await SmsModule.restorePreviousDefaultSms();
              console.log('[Block] Restore previous SMS result:', result);
            } catch (error) {
              console.log('[Block] Restore error:', error?.message || error);
            }
          },
        },
      ],
    );
  };

  const executeBlock = async () => {
    setIsBlocking(true);
    const { SmsModule } = NativeModules;

    try {
      if (!SmsModule) {
        throw new Error('SmsModule is not available');
      }

      // Use the combined flow: request Default SMS role if needed → block → offer restore
      if (SmsModule.blockSenderWithRoleFlow) {
        console.log('[Block] Using combined role+block flow for:', senderToBlock);
        const blockResult = await SmsModule.blockSenderWithRoleFlow(senderToBlock);
        console.log('[Block] Combined flow result:', blockResult);

        if (blockResult?.success) {
          Alert.alert('Success', `Successfully blocked ${senderToBlock}.`);
          offerRestorePreviousSms(blockResult);
          return;
        }

        if (blockResult?.requiresRole) {
          showBlockFailure(
            blockResult?.message ||
              'Android requires Kinetic Vault to be set as the Default SMS app to block senders. Please approve the prompt and try again.',
          );
          return;
        }

        showBlockFailure(blockResult?.message);
        return;
      }

      // Fallback: old separate flow for older module versions
      console.log('[Block] Falling back to separate role+block flow');
      const status = SmsModule.getSenderBlockStatus
        ? await SmsModule.getSenderBlockStatus()
        : null;
      logBlockStatus('Initial status', status);

      if (!status?.canBlockSender) {
        Alert.alert('Permission Required',
          'Android requires this app to be the Default SMS app to block senders. ' +
          'Tap Continue to open the Android settings prompt.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Continue',
              onPress: async () => {
                setIsBlocking(true);
                try {
                  const roleStatus = await SmsModule.requestSenderBlockingRole();
                  logBlockStatus('Role request result', roleStatus);
                  if (roleStatus?.canBlockSender) {
                    const result = await SmsModule.blockSender(senderToBlock);
                    console.log('[Block] Block result:', result);
                    if (result?.success) {
                      Alert.alert('Success', `Successfully blocked ${senderToBlock}.`);
                    } else {
                      showBlockFailure(result?.message);
                    }
                  } else {
                    showBlockFailure('Default SMS role was not granted.');
                  }
                } catch (error) {
                  showBlockFailure(error?.message);
                } finally {
                  setIsBlocking(false);
                }
              },
            },
          ],
        );
        return;
      }

      console.log('[Block] Attempting to block:', senderToBlock);
      const blockResult = await SmsModule.blockSender(senderToBlock);
      console.log('[Block] Block result:', blockResult);
      if (blockResult?.success) {
        Alert.alert('Success', `Successfully blocked ${senderToBlock}.`);
      } else {
        showBlockFailure(blockResult?.message);
      }
    } catch (error) {
      console.log('[Block] Block flow handled safely:', error?.message || error);
      showBlockFailure(error?.message);
    } finally {
      setIsBlocking(false);
    }
  };

  return (
    <ScreenWrapper>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={[styles.backText, { color: '#00FF41' }]}>{'< Back'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Threat Analysis</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Threat Status Card */}
        <GlassCard style={styles.threatCard} glowColor={threatColor}>
          <View style={styles.threatContent}>
            <View style={styles.shieldContainer}>
              <View style={[styles.outerRing, { borderColor: threatColor }]} />
              <View style={[styles.innerRing, { borderColor: threatColor }]} />
              <Svg width="44" height="44" viewBox="0 0 24 24" fill="none">
                <Path d="M12 22C12 22 20 18 20 12V5L12 2L4 5V12C4 18 12 22 12 22Z" fill={threatColor} />
                <Path d="M12 22C12 22 20 18 20 12V5L12 2V22Z" fill="#000000" opacity="0.15" />
              </Svg>
              <View style={[styles.dot, styles.dotTopLeft, { backgroundColor: threatColor }]} />
              <View style={[styles.dot, styles.dotBottomRight, { backgroundColor: threatColor }]} />
            </View>
            <View style={styles.threatTextContainer}>
              <Text style={[styles.threatTitle, { color: threatColor }]}>
                Threat Detected
              </Text>
              <Text style={styles.threatSubtitle}>
                This content shows signs of potential risk.
              </Text>
              <View style={[styles.riskBadge, { borderColor: threatColor }]}>
                <Text style={[styles.riskBadgeText, { color: threatColor }]}>
                  {result.threatLevel.toUpperCase()} RISK
                </Text>
              </View>
            </View>
          </View>
        </GlassCard>

        {/* Confidence */}
        <GlassCard style={styles.confidenceCard}>
          <View style={styles.confidenceRow}>
            <View style={styles.confidenceItem}>
              <View style={{ alignItems: 'center' }}>
                <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 4 }}>
                  <Circle cx="12" cy="12" r="10" stroke={threatColor} strokeWidth="2" />
                  <Circle cx="12" cy="12" r="6" stroke={threatColor} strokeWidth="2" />
                  <Circle cx="12" cy="12" r="2" fill={threatColor} />
                </Svg>
                <Text
                  style={[styles.confidenceValue, { color: threatColor, fontSize: 18 }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.5}
                >
                  {result.threatLevel.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.confidenceLabel}>Threat Level</Text>
            </View>
            <View style={styles.confidenceDivider} />
            <View style={styles.confidenceItem}>
              <View style={{ alignItems: 'center' }}>
                <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 4 }}>
                  <Circle cx="11" cy="11" r="7" stroke="#A855F7" strokeWidth="2" />
                  <Path d="M21 21L16 16" stroke="#A855F7" strokeWidth="2" strokeLinecap="round" />
                </Svg>
                <Text style={styles.confidenceValue}>
                  {result.keywords?.length || 0}
                </Text>
              </View>
              <Text style={styles.confidenceLabel}>Keywords</Text>
            </View>
          </View>
        </GlassCard>

        {/* Keywords */}
        {result.keywords && result.keywords.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>🔑 Detected Keywords</Text>
            <View style={styles.keywordsContainer}>
              {result.keywords.map((kw, index) => (
                <KeywordBadge
                  key={index}
                  word={kw.word}
                  confidence={kw.confidence}
                  type={kw.type}
                />
              ))}
            </View>
          </>
        )}

        {/* Entities */}
        {result.entities && (
          <>
            <Text style={styles.sectionTitle}>🔗 Extracted Entities</Text>
            <GlassCard style={styles.entitiesCard}>
              <EntityRow
                label="URLs"
                items={result.entities.urls || []}
                emptyText="No URLs detected"
              />
              <EntityRow
                label="Phone Numbers"
                items={result.entities.phoneNumbers || []}
                emptyText="No phone numbers detected"
              />
              <EntityRow
                label="UPI IDs"
                items={result.entities.upiIds || []}
                emptyText="No UPI IDs detected"
              />
            </GlassCard>
          </>
        )}

        {/* AI Explanation */}
        <Text style={styles.sectionTitle}>🤖 AI Analysis</Text>
        <GlassCard style={styles.explanationCard}>
          <Text style={styles.explanationText}>{result.explanation}</Text>
        </GlassCard>

        {/* Actions */}
        <NeonButton
          title={isBlocking ? "🚫 Blocking..." : "🚫 Block Sender"}
          onPress={handleBlockMessage}
          style={styles.reportBtn}
          disabled={isBlocking}
        />
        <NeonButton
          title="🔍 Scan Another"
          variant="outline"
          onPress={() => navigation.navigate('MainTabs', { screen: 'Scan' })}
          style={styles.scanBtn}
        />

        <View style={{ height: 40 }} />
      </ScrollView>
    </ScreenWrapper>
  );
};

const EntityRow = ({ label, items, emptyText }) => (
  <View style={styles.entityRow}>
    <Text style={styles.entityLabel}>{label}</Text>
    {items.length > 0 ? (
      items.map((item, idx) => (
        <Text key={idx} style={styles.entityValue}>
          • {item}
        </Text>
      ))
    ) : (
      <Text style={styles.entityEmpty}>{emptyText}</Text>
    )}
  </View>
);

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 16,
  },
  backBtn: {
    width: 60,
  },
  backText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  threatCard: {
    marginBottom: 24,
    paddingVertical: 8,
  },
  threatContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  shieldContainer: {
    position: 'relative',
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  outerRing: {
    position: 'absolute',
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1,
    opacity: 0.1,
  },
  innerRing: {
    position: 'absolute',
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1,
    opacity: 0.2,
  },
  dot: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  dotTopLeft: {
    top: 14,
    left: 8,
  },
  dotBottomRight: {
    bottom: 14,
    right: 8,
  },
  threatTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  threatTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  threatSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  riskBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  riskBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  confidenceCard: {
    marginBottom: 24,
  },
  confidenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  confidenceItem: {
    alignItems: 'center',
    flex: 1,
  },
  confidenceValue: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  confidenceLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '500',
    marginTop: 4,
  },
  confidenceDivider: {
    width: 1,
    height: 40,
    backgroundColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  keywordsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 24,
  },
  entitiesCard: {
    marginBottom: 24,
  },
  entityRow: {
    marginBottom: 12,
  },
  entityLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  entityValue: {
    color: COLORS.textPrimary,
    fontSize: 13,
    marginLeft: 8,
    marginBottom: 2,
  },
  entityEmpty: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
  },
  explanationCard: {
    marginBottom: 24,
  },
  explanationText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 22,
  },
  reportBtn: {
    marginBottom: 12,
  },
  scanBtn: {
    marginBottom: 12,
  },
});

export default AnalysisResultScreen;
