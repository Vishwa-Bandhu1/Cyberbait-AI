import React from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity} from 'react-native';
import ScreenWrapper from '../components/ScreenWrapper';
import GlassCard from '../components/GlassCard';
import NeonButton from '../components/NeonButton';
import {COLORS} from '../theme';

const SafeResultScreen = ({route, navigation}) => {
  const {result} = route.params;

  return (
    <ScreenWrapper>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan Results</Text>
          <View style={{width: 60}} />
        </View>

        {/* Safe status animation area */}
        <View style={styles.safeContainer}>
          {/* Glow effect */}
          <View style={styles.glowOuter} />
          <View style={styles.glowMiddle} />
          <View style={styles.glowInner} />

          {/* Shield */}
          <View style={styles.shieldCircle}>
            <Text style={styles.shieldIcon}>✅</Text>
          </View>
        </View>

        {/* Title */}
        <Text style={styles.safeTitle}>All Clear!</Text>
        <Text style={styles.safeSubtitle}>No threats detected</Text>

        {/* Score Card */}
        <GlassCard style={styles.scoreCard} glowColor={COLORS.safe}>
          <View style={styles.scoreRow}>
            <View style={styles.scoreItem}>
              <Text style={styles.scoreValue}>{result.riskScore}</Text>
              <Text style={styles.scoreValueSuffix}>/100</Text>
            </View>
            <View style={styles.scoreDivider} />
            <View style={styles.scoreItem}>
              <Text style={[styles.scoreBadge, {color: COLORS.safe}]}>
                {result.threatLevel || 'NONE'}
              </Text>
              <Text style={styles.scoreLabel}>Risk Level</Text>
            </View>
          </View>
        </GlassCard>

        {/* AI Explanation */}
        <Text style={styles.sectionTitle}>🤖 Why this is safe</Text>
        <GlassCard style={styles.explanationCard}>
          <Text style={styles.explanationText}>
            {result.explanation || 'This message does not contain any known scam patterns, phishing indicators, or malicious content.'}
          </Text>
        </GlassCard>

        {/* Safety Checks */}
        <Text style={styles.sectionTitle}>✅ Safety Checks Passed</Text>
        <GlassCard style={styles.checksCard}>
          <SafetyCheck label="No phishing patterns detected" />
          <SafetyCheck label="No suspicious URLs found" />
          <SafetyCheck label="No urgency manipulation detected" />
          <SafetyCheck label="No financial fraud indicators" />
          <SafetyCheck label="No impersonation attempt" />
        </GlassCard>

        {/* Entities */}
        {result.entities && (
          <GlassCard style={styles.entitiesCard}>
            <Text style={styles.entitiesTitle}>Extracted Entities</Text>
            <View style={styles.entityRow}>
              <Text style={styles.entityLabel}>URLs:</Text>
              <Text style={styles.entityValue}>
                {result.entities.urls?.length || 0} found
              </Text>
            </View>
            <View style={styles.entityRow}>
              <Text style={styles.entityLabel}>Phone Numbers:</Text>
              <Text style={styles.entityValue}>
                {result.entities.phoneNumbers?.length || 0} found
              </Text>
            </View>
            <View style={styles.entityRow}>
              <Text style={styles.entityLabel}>UPI IDs:</Text>
              <Text style={styles.entityValue}>
                {result.entities.upiIds?.length || 0} found
              </Text>
            </View>
          </GlassCard>
        )}

        {/* Actions */}
        <NeonButton
          title="🔍 Scan Another Message"
          onPress={() => navigation.navigate('MainTabs', { screen: 'Scan' })}
          style={styles.scanBtn}
        />
        <NeonButton
          title="🏠 Back to Dashboard"
          variant="outline"
          onPress={() => navigation.navigate('MainTabs', { screen: 'Home' })}
          style={styles.homeBtn}
        />

        <View style={{height: 40}} />
      </ScrollView>
    </ScreenWrapper>
  );
};

const SafetyCheck = ({label}) => (
  <View style={styles.checkRow}>
    <View style={styles.checkIcon}>
      <Text style={styles.checkEmoji}>✓</Text>
    </View>
    <Text style={styles.checkLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 16,
  },
  backBtn: {width: 60},
  backText: {color: COLORS.primary, fontSize: 16, fontWeight: '600'},
  headerTitle: {color: COLORS.textPrimary, fontSize: 16, fontWeight: '700'},
  safeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 180,
    marginVertical: 20,
  },
  glowOuter: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(0, 255, 65, 0.04)',
  },
  glowMiddle: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(0, 255, 65, 0.08)',
  },
  glowInner: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(0, 255, 65, 0.12)',
  },
  shieldCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0, 255, 65, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.primaryGlow,
  },
  shieldIcon: {fontSize: 40},
  safeTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.safe,
    textAlign: 'center',
  },
  safeSubtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  scoreCard: {marginBottom: 24},
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  scoreItem: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  scoreValue: {
    fontSize: 42,
    fontWeight: '900',
    color: COLORS.safe,
  },
  scoreValueSuffix: {
    fontSize: 18,
    fontWeight: '500',
    color: COLORS.textMuted,
    marginLeft: 2,
  },
  scoreDivider: {
    width: 1,
    height: 50,
    backgroundColor: COLORS.border,
  },
  scoreBadge: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 2,
  },
  scoreLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  explanationCard: {marginBottom: 24},
  explanationText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 22,
  },
  checksCard: {marginBottom: 24},
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  checkIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 255, 65, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkEmoji: {
    color: COLORS.safe,
    fontSize: 14,
    fontWeight: '700',
  },
  checkLabel: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  entitiesCard: {marginBottom: 24},
  entitiesTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
  },
  entityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  entityLabel: {color: COLORS.textSecondary, fontSize: 13},
  entityValue: {color: COLORS.textPrimary, fontSize: 13, fontWeight: '600'},
  scanBtn: {marginBottom: 12},
  homeBtn: {marginBottom: 12},
});

export default SafeResultScreen;
