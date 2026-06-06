import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {COLORS, SIZES} from '../theme';

const RiskMeter = ({score = 0, size = 120}) => {
  const getColor = () => {
    if (score <= 20) return COLORS.riskNone;
    if (score <= 40) return COLORS.riskLow;
    if (score <= 60) return COLORS.riskMedium;
    if (score <= 80) return COLORS.riskHigh;
    return COLORS.riskCritical;
  };

  const getLabel = () => {
    if (score <= 20) return 'SAFE';
    if (score <= 40) return 'LOW';
    if (score <= 60) return 'MEDIUM';
    if (score <= 80) return 'HIGH';
    return 'CRITICAL';
  };

  const color = getColor();
  const circumference = 2 * Math.PI * (size / 2 - 10);
  const progress = (score / 100) * 270; // 270 degrees arc

  return (
    <View style={[styles.container, {width: size, height: size}]}>
      {/* Background circle */}
      <View
        style={[
          styles.outerRing,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: 'rgba(255,255,255,0.05)',
          },
        ]}
      />

      {/* Progress arc (simplified as a colored border) */}
      <View
        style={[
          styles.progressRing,
          {
            width: size - 8,
            height: size - 8,
            borderRadius: (size - 8) / 2,
            borderColor: color,
            borderTopColor: color,
            borderRightColor: score > 25 ? color : 'transparent',
            borderBottomColor: score > 50 ? color : 'transparent',
            borderLeftColor: score > 75 ? color : 'transparent',
          },
        ]}
      />

      {/* Inner content */}
      <View style={styles.innerContent}>
        <Text style={[styles.score, {color, fontSize: size * 0.28}]}>{score}</Text>
        <Text style={[styles.label, {color, fontSize: size * 0.1}]}>{getLabel()}</Text>
      </View>

      {/* Glow effect */}
      <View
        style={[
          styles.glow,
          {
            width: size + 20,
            height: size + 20,
            borderRadius: (size + 20) / 2,
            backgroundColor: color,
            opacity: 0.05,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerRing: {
    position: 'absolute',
    borderWidth: 3,
  },
  progressRing: {
    position: 'absolute',
    borderWidth: 4,
    transform: [{rotate: '-45deg'}],
  },
  innerContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: {
    fontWeight: '800',
  },
  label: {
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 2,
  },
  glow: {
    position: 'absolute',
  },
});

export default RiskMeter;
