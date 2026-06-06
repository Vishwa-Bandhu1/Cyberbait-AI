import React, {useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import ScreenWrapper from '../components/ScreenWrapper';
import GlassCard from '../components/GlassCard';
import {COLORS, SIZES} from '../theme';
import {getHistory} from '../services/api';

const DashboardScreen = ({navigation}) => {
  const [stats, setStats] = useState({
    totalScans: 0,
    threatsDetected: 0,
    safeMessages: 0,
  });
  const [recentScans, setRecentScans] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState('SAFE');

  const loadData = async () => {
    try {
      const history = await getHistory();
      const total = history.length;
      const threats = history.filter(h => h.riskScore > 40).length;
      const safe = total - threats;

      setStats({totalScans: total, threatsDetected: threats, safeMessages: safe});
      setRecentScans(history.slice(0, 5));

      // Set overall status based on recent threats
      if (threats > 0 && history[0]?.riskScore > 60) {
        setStatus('ALERT');
      } else {
        setStatus('SAFE');
      }
    } catch (error) {
      console.log('Dashboard load error:', error?.message || error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, []),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const getThreatColor = score => {
    if (score <= 20) return COLORS.riskNone;
    if (score <= 40) return COLORS.riskLow;
    if (score <= 60) return COLORS.riskMedium;
    if (score <= 80) return COLORS.riskHigh;
    return COLORS.riskCritical;
  };

  return (
    <ScreenWrapper>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.logo}>CYBERBAIT</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.notifBtn}>
              <Text style={styles.notifIcon}>🔔</Text>
            </TouchableOpacity>
            <View style={styles.avatarContainer}>
              <Text style={styles.avatar}>🛡️</Text>
            </View>
          </View>
        </View>

        {/* Status Card */}
        <GlassCard
          style={styles.statusCard}
          glowColor={status === 'SAFE' ? COLORS.safe : COLORS.danger}>
          <View style={styles.statusContent}>
            <View style={styles.statusLeft}>
              <View
                style={[
                  styles.statusIcon,
                  {
                    backgroundColor:
                      status === 'SAFE'
                        ? 'rgba(0,255,65,0.1)'
                        : 'rgba(255,59,48,0.1)',
                  },
                ]}>
                <Text style={styles.statusEmoji}>
                  {status === 'SAFE' ? '✅' : '⚠️'}
                </Text>
              </View>
              <View>
                <Text style={styles.statusTitle}>System Status</Text>
                <Text
                  style={[
                    styles.statusValue,
                    {color: status === 'SAFE' ? COLORS.safe : COLORS.danger},
                  ]}>
                  {status === 'SAFE' ? 'All Clear' : 'Threats Detected'}
                </Text>
              </View>
            </View>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor:
                    status === 'SAFE'
                      ? 'rgba(0,255,65,0.15)'
                      : 'rgba(255,59,48,0.15)',
                },
              ]}>
              <Text
                style={[
                  styles.statusBadgeText,
                  {color: status === 'SAFE' ? COLORS.safe : COLORS.danger},
                ]}>
                {status}
              </Text>
            </View>
          </View>
        </GlassCard>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <GlassCard style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.totalScans}</Text>
            <Text style={styles.statLabel}>Total Scans</Text>
          </GlassCard>
          <GlassCard style={[styles.statCard, {marginHorizontal: 10}]}>
            <Text style={[styles.statNumber, {color: COLORS.danger}]}>
              {stats.threatsDetected}
            </Text>
            <Text style={styles.statLabel}>Threats</Text>
          </GlassCard>
          <GlassCard style={styles.statCard}>
            <Text style={[styles.statNumber, {color: COLORS.safe}]}>
              {stats.safeMessages}
            </Text>
            <Text style={styles.statLabel}>Safe</Text>
          </GlassCard>
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('Scan')}>
            <View style={styles.actionIcon}>
              <Text style={styles.actionEmoji}>🔍</Text>
            </View>
            <Text style={styles.actionText}>Scan{'\n'}Message</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('History')}>
            <View style={styles.actionIcon}>
              <Text style={styles.actionEmoji}>📊</Text>
            </View>
            <Text style={styles.actionText}>View{'\n'}History</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate('Settings')}>
            <View style={styles.actionIcon}>
              <Text style={styles.actionEmoji}>⚙️</Text>
            </View>
            <Text style={styles.actionText}>App{'\n'}Settings</Text>
          </TouchableOpacity>
        </View>

        {/* Recent Activity */}
        {recentScans.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            {recentScans.map((scan, index) => (
              <TouchableOpacity
                key={scan.id || index}
                onPress={() =>
                  navigation.navigate(
                    scan.riskScore > 40 ? 'AnalysisResult' : 'SafeResult',
                    {result: scan},
                  )
                }>
                <GlassCard style={styles.activityCard}>
                  <View style={styles.activityRow}>
                    <View
                      style={[
                        styles.activityDot,
                        {backgroundColor: getThreatColor(scan.riskScore)},
                      ]}
                    />
                    <View style={styles.activityContent}>
                      <Text style={styles.activityText} numberOfLines={1}>
                        {scan.content || 'Message analyzed'}
                      </Text>
                      <Text style={styles.activityMeta}>
                        Risk: {scan.riskScore}% · {scan.threatLevel}
                      </Text>
                    </View>
                    <Text style={styles.activityArrow}>›</Text>
                  </View>
                </GlassCard>
              </TouchableOpacity>
            ))}
          </>
        )}

        <View style={{height: 100}} />
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
    paddingBottom: 20,
  },
  logo: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  notifBtn: {
    marginRight: 12,
  },
  notifIcon: {
    fontSize: 20,
  },
  avatarContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 255, 65, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.primaryGlow,
  },
  avatar: {
    fontSize: 18,
  },
  statusCard: {
    marginBottom: 16,
  },
  statusContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  statusEmoji: {
    fontSize: 22,
  },
  statusTitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  statusValue: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  actionCard: {
    flex: 1,
    backgroundColor: COLORS.cardBackground,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 255, 65, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  actionEmoji: {
    fontSize: 22,
  },
  actionText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },
  activityCard: {
    marginBottom: 8,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  activityContent: {
    flex: 1,
  },
  activityText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  activityMeta: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  activityArrow: {
    color: COLORS.textMuted,
    fontSize: 24,
    fontWeight: '300',
  },
});

export default DashboardScreen;
