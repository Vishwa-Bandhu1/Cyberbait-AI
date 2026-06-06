import React from 'react';
import {View, StyleSheet} from 'react-native';
import {COLORS} from '../theme';

const GlassCard = ({children, style, glowColor, noBorder}) => {
  return (
    <View
      style={[
        styles.card,
        !noBorder && styles.border,
        glowColor && {borderColor: glowColor},
        style,
      ]}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 16,
    padding: 16,
    overflow: 'hidden',
  },
  border: {
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
});

export default GlassCard;
