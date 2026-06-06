import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {COLORS, SIZES} from '../theme';

const KeywordBadge = ({word, confidence, type}) => {
  const getTypeColor = () => {
    switch (type) {
      case 'urgency':
        return COLORS.danger;
      case 'phishing':
        return COLORS.critical;
      case 'financial':
        return COLORS.warning;
      case 'threat':
        return COLORS.danger;
      case 'social_engineering':
        return '#FF6B9C';
      case 'impersonation':
        return '#9B59B6';
      default:
        return COLORS.warning;
    }
  };

  const color = getTypeColor();

  return (
    <View style={[styles.badge, {borderColor: color + '40', backgroundColor: color + '15'}]}>
      <View style={styles.content}>
        <Text style={[styles.word, {color}]}>{word}</Text>
        <View style={styles.meta}>
          <View style={[styles.typeDot, {backgroundColor: color}]} />
          <Text style={styles.type}>{type?.replace('_', ' ')}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: SIZES.radiusMD,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginRight: 8,
    marginBottom: 8,
  },
  content: {
    alignItems: 'flex-start',
  },
  word: {
    fontSize: SIZES.fontSM,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  confidence: {
    fontSize: SIZES.fontXS,
    fontWeight: '600',
  },
  typeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginRight: 6,
  },
  type: {
    fontSize: SIZES.fontXS,
    color: COLORS.textSecondary,
    textTransform: 'capitalize',
  },
});

export default KeywordBadge;
