import React, {useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import ScreenWrapper from '../components/ScreenWrapper';
import GlassCard from '../components/GlassCard';
import {COLORS} from '../theme';
import {getHistory} from '../services/api';

const HistoryScreen = ({navigation}) => {
  const [scans, setScans] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, []),
  );

  const loadHistory = async () => {
    try {
      setLoading(true);
      const data = await getHistory();
      setScans(data);
      setFiltered(data);
    } catch (error) {
      console.log('History load error:', error?.message || error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = text => {
    setSearchQuery(text);
    applyFilters(text, activeFilter);
  };

  const handleFilterChange = filter => {
    setActiveFilter(filter);
    applyFilters(searchQuery, filter);
  };

  const applyFilters = (query, filter) => {
    let results = scans;

    // Text search
    if (query.trim()) {
      results = results.filter(
        s =>
          s.content?.toLowerCase().includes(query.toLowerCase()) ||
          s.threatLevel?.toLowerCase().includes(query.toLowerCase()),
      );
    }

    // Status filter
    if (filter === 'threats') {
      results = results.filter(s => s.riskScore > 40);
    } else if (filter === 'safe') {
      results = results.filter(s => s.riskScore <= 40);
    }

    setFiltered(results);
  };

  const getThreatColor = score => {
    if (score <= 20) return COLORS.riskNone;
    if (score <= 40) return COLORS.riskLow;
    if (score <= 60) return COLORS.riskMedium;
    if (score <= 80) return COLORS.riskHigh;
    return COLORS.riskCritical;
  };

  const formatDate = dateStr => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const renderItem = ({item}) => {
    const color = getThreatColor(item.riskScore);
    return (
      <TouchableOpacity
        onPress={() =>
          navigation.navigate(
            item.riskScore > 40 ? 'AnalysisResult' : 'SafeResult',
            {result: item},
          )
        }>
        <GlassCard style={styles.scanCard}>
          <View style={styles.scanRow}>
            <View style={[styles.scanIndicator, {backgroundColor: color}]} />
            <View style={styles.scanContent}>
              <Text style={styles.scanText} numberOfLines={2}>
                {item.content || 'Message analyzed'}
              </Text>
              <View style={styles.scanMeta}>
                <View style={[styles.threatBadge, {backgroundColor: color + '20', borderColor: color + '40'}]}>
                  <Text style={[styles.threatBadgeText, {color}]}>
                    {item.threatLevel}
                  </Text>
                </View>
                <Text style={styles.scanDate}>{formatDate(item.createdAt)}</Text>
              </View>
            </View>
            <View style={styles.scoreContainer}>
              <Text style={[styles.scoreText, {color}]}>{item.riskScore}</Text>
              <Text style={styles.scoreUnit}>%</Text>
            </View>
          </View>
        </GlassCard>
      </TouchableOpacity>
    );
  };

  return (
    <ScreenWrapper>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Scan History</Text>
        <Text style={styles.countBadge}>{scans.length} scans</Text>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search scans..."
          placeholderTextColor={COLORS.textMuted}
          value={searchQuery}
          onChangeText={handleSearch}
        />
      </View>

      {/* Filters */}
      <View style={styles.filterRow}>
        {['all', 'threats', 'safe'].map(filter => (
          <TouchableOpacity
            key={filter}
            onPress={() => handleFilterChange(filter)}
            style={[
              styles.filterBtn,
              activeFilter === filter && styles.filterBtnActive,
            ]}>
            <Text
              style={[
                styles.filterText,
                activeFilter === filter && styles.filterTextActive,
              ]}>
              {filter.charAt(0).toUpperCase() + filter.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={(item, index) => item.id || index.toString()}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyTitle}>No scans yet</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery
                ? 'No results match your search'
                : 'Start scanning messages to see history here'}
            </Text>
          </View>
        }
      />
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
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  countBadge: {
    color: COLORS.textSecondary,
    fontSize: 13,
    backgroundColor: COLORS.cardBackground,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    overflow: 'hidden',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    marginBottom: 16,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 14,
    paddingVertical: 14,
  },
  filterRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  filterBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.cardBackground,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(0, 255, 65, 0.08)',
  },
  filterText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  filterTextActive: {
    color: COLORS.primary,
  },
  listContent: {
    paddingBottom: 100,
  },
  scanCard: {
    marginBottom: 10,
  },
  scanRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scanIndicator: {
    width: 4,
    height: 44,
    borderRadius: 2,
    marginRight: 14,
  },
  scanContent: {
    flex: 1,
  },
  scanText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  scanMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  threatBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    marginRight: 8,
  },
  threatBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  scanDate: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginLeft: 12,
  },
  scoreText: {
    fontSize: 22,
    fontWeight: '800',
  },
  scoreUnit: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default HistoryScreen;
