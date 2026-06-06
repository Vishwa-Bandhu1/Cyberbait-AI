import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Alert} from 'react-native';
import ScreenWrapper from '../components/ScreenWrapper';
import GlassCard from '../components/GlassCard';
import NeonButton from '../components/NeonButton';
import {COLORS} from '../theme';
import {generateReport, getPdfReportUrl} from '../services/api';

const ThreatReportScreen = ({route, navigation}) => {
  const {result} = route.params;
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReport();
  }, []);

  const loadReport = async () => {
    try {
      const reportData = await generateReport(result.id);
      setReport(reportData);
    } catch (error) {
      console.error('Report generation error:', error);
      Alert.alert('Error', 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    try {
      const url = getPdfReportUrl(result.id);
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'Cannot open PDF download URL');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to download PDF');
    }
  };

  if (loading) {
    return (
      <ScreenWrapper>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Generating Report...</Text>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Threat Report</Text>
          <View style={{width: 60}} />
        </View>

        {/* Report ID Banner */}
        <GlassCard style={styles.idCard} glowColor={COLORS.danger}>
          <View style={styles.idRow}>
            <View>
              <Text style={styles.idLabel}>REPORT ID</Text>
              <Text style={styles.idValue}>{report?.reportId || 'N/A'}</Text>
            </View>
            <View style={styles.riskBadge}>
              <Text style={styles.riskBadgeText}>{report?.riskLevel || result.threatLevel}</Text>
            </View>
          </View>
        </GlassCard>

        {/* Threat Summary */}
        <Text style={styles.sectionTitle}>📊 Threat Summary</Text>
        <GlassCard style={styles.summaryCard}>
          <SummaryRow label="Risk Score" value={`${result.riskScore}/100`} />
          <SummaryRow label="Threat Level" value={result.threatLevel} valueColor={COLORS.danger} />
          <SummaryRow label="Keywords Found" value={`${result.keywords?.length || 0}`} />
          <SummaryRow label="Analyzed At" value={result.createdAt?.split('T')[0] || 'N/A'} />
          <SummaryRow label="Report Generated" value={report?.createdAt?.split('T')[0] || 'Now'} />
        </GlassCard>

        {/* Detailed Analysis */}
        <Text style={styles.sectionTitle}>🔍 Detailed Analysis</Text>
        <GlassCard style={styles.analysisCard}>
          <Text style={styles.analysisText}>{result.explanation}</Text>
        </GlassCard>

        {/* Keywords */}
        {result.keywords?.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>🔑 Flagged Keywords</Text>
            <GlassCard style={styles.keywordsCard}>
              {result.keywords.map((kw, idx) => (
                <View key={idx} style={styles.kwRow}>
                  <View style={styles.kwDot} />
                  <View style={styles.kwContent}>
                    <Text style={styles.kwWord}>{kw.word}</Text>
                    <Text style={styles.kwMeta}>
                      {kw.type} · {kw.confidence}% confidence
                    </Text>
                  </View>
                </View>
              ))}
            </GlassCard>
          </>
        )}

        {/* Entities */}
        <Text style={styles.sectionTitle}>🔗 Entity Analysis</Text>
        <GlassCard style={styles.entitiesCard}>
          <EntitySection
            label="URLs"
            items={result.entities?.urls}
            icon="🌐"
          />
          <EntitySection
            label="Phone Numbers"
            items={result.entities?.phoneNumbers}
            icon="📞"
          />
          <EntitySection
            label="UPI IDs"
            items={result.entities?.upiIds}
            icon="💳"
          />
        </GlassCard>

        {/* Actions */}
        <NeonButton
          title="📥 Download PDF Report"
          onPress={handleDownloadPdf}
          style={styles.pdfBtn}
        />
        <NeonButton
          title="🏠 Return to Dashboard"
          variant="outline"
          onPress={() => navigation.navigate('MainTabs', { screen: 'Home' })}
          style={styles.homeBtn}
        />

        <View style={{height: 40}} />
      </ScrollView>
    </ScreenWrapper>
  );
};

const SummaryRow = ({label, value, valueColor}) => (
  <View style={styles.summaryRow}>
    <Text style={styles.summaryLabel}>{label}</Text>
    <Text style={[styles.summaryValue, valueColor && {color: valueColor}]}>{value}</Text>
  </View>
);

const EntitySection = ({label, items, icon}) => (
  <View style={styles.entitySection}>
    <View style={styles.entityHeader}>
      <Text style={styles.entityIcon}>{icon}</Text>
      <Text style={styles.entityLabel}>{label}</Text>
      <Text style={styles.entityCount}>{items?.length || 0}</Text>
    </View>
    {items?.length > 0 ? (
      items.map((item, idx) => (
        <Text key={idx} style={styles.entityValue}>
          {item}
        </Text>
      ))
    ) : (
      <Text style={styles.entityEmpty}>None detected</Text>
    )}
  </View>
);

const styles = StyleSheet.create({
  loadingContainer: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  loadingText: {color: COLORS.textSecondary, fontSize: 16},
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
  idCard: {marginBottom: 24},
  idRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  idLabel: {color: COLORS.textSecondary, fontSize: 11, fontWeight: '600', letterSpacing: 2},
  idValue: {color: COLORS.textPrimary, fontSize: 24, fontWeight: '900', marginTop: 4},
  riskBadge: {
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.3)',
  },
  riskBadgeText: {color: COLORS.danger, fontSize: 12, fontWeight: '800', letterSpacing: 1},
  sectionTitle: {fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 12},
  summaryCard: {marginBottom: 24},
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  summaryLabel: {color: COLORS.textSecondary, fontSize: 14},
  summaryValue: {color: COLORS.textPrimary, fontSize: 14, fontWeight: '600'},
  analysisCard: {marginBottom: 24},
  analysisText: {color: COLORS.textSecondary, fontSize: 14, lineHeight: 22},
  keywordsCard: {marginBottom: 24},
  kwRow: {flexDirection: 'row', alignItems: 'center', marginBottom: 12},
  kwDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.danger,
    marginRight: 12,
  },
  kwContent: {},
  kwWord: {color: COLORS.textPrimary, fontSize: 14, fontWeight: '700'},
  kwMeta: {color: COLORS.textSecondary, fontSize: 12, marginTop: 2},
  entitiesCard: {marginBottom: 24},
  entitySection: {marginBottom: 16},
  entityHeader: {flexDirection: 'row', alignItems: 'center', marginBottom: 8},
  entityIcon: {fontSize: 16, marginRight: 8},
  entityLabel: {color: COLORS.textPrimary, fontSize: 14, fontWeight: '600', flex: 1},
  entityCount: {
    color: COLORS.textSecondary,
    fontSize: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  entityValue: {color: COLORS.primary, fontSize: 13, marginLeft: 24, marginBottom: 4},
  entityEmpty: {color: COLORS.textMuted, fontSize: 13, marginLeft: 24, fontStyle: 'italic'},
  pdfBtn: {marginBottom: 12},
  homeBtn: {marginBottom: 12},
});

export default ThreatReportScreen;
