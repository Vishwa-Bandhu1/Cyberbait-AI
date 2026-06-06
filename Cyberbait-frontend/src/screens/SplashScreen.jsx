import React, {useEffect, useRef} from 'react';
import {View, Text, StyleSheet, Animated, Dimensions} from 'react-native';
import {COLORS} from '../theme';

const {width, height} = Dimensions.get('window');

const SplashScreen = ({navigation}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.3)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const subtitleAnim = useRef(new Animated.Value(0)).current;
  const particleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Shield icon animation
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
      ]),
      // Glow pulse
      Animated.timing(glowAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      // Subtitle fade
      Animated.timing(subtitleAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();

    // Particle animation loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(particleAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(particleAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ]),
    ).start();

    // Navigate after splash
    const timer = setTimeout(() => {
      navigation.replace('Onboarding');
    }, 3500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      {/* Background grid lines */}
      <View style={styles.gridOverlay}>
        {Array.from({length: 8}).map((_, i) => (
          <View key={`h-${i}`} style={[styles.gridLine, {top: (height / 8) * i}]} />
        ))}
        {Array.from({length: 6}).map((_, i) => (
          <View key={`v-${i}`} style={[styles.gridLineV, {left: (width / 6) * i}]} />
        ))}
      </View>

      {/* Security status bar */}
      <Animated.View style={[styles.statusBar, {opacity: subtitleAnim}]}>
        <View style={styles.statusDot} />
        <Text style={styles.statusText}>SECURITY LAYER ACTIVE</Text>
      </Animated.View>

      {/* Main shield icon */}
      <Animated.View
        style={[
          styles.shieldContainer,
          {
            opacity: fadeAnim,
            transform: [{scale: scaleAnim}],
          },
        ]}>
        {/* Outer glow ring */}
        <Animated.View
          style={[
            styles.outerRing,
            {
              opacity: glowAnim,
              transform: [
                {
                  scale: particleAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.15],
                  }),
                },
              ],
            },
          ]}
        />

        {/* Middle ring */}
        <View style={styles.middleRing} />

        {/* Shield icon */}
        <View style={styles.shield}>
          <Text style={styles.shieldIcon}>🛡️</Text>
        </View>

        {/* Scanning dot */}
        <Animated.View
          style={[
            styles.scanDot,
            {
              opacity: particleAnim.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [1, 0.3, 1],
              }),
            },
          ]}
        />
      </Animated.View>

      {/* Title */}
      <Animated.View style={{opacity: fadeAnim}}>
        <Text style={styles.title}>
          <Text style={styles.titleGreen}>CYBERBAIT</Text>
          {'\n'}
          <Text style={styles.titleWhite}>AN AI-BASED SCAM CONVERSATION</Text>
        </Text>
      </Animated.View>

      {/* Divider */}
      <Animated.View style={[styles.divider, {opacity: glowAnim}]} />

      {/* Subtitle */}
      <Animated.View style={{opacity: subtitleAnim}}>
        <Text style={styles.subtitle}>Smart Protection Against Digital{'\n'}Scams</Text>
        <Text style={styles.description}>
          Your impenetrable sanctuary for digital assets and{'\n'}encrypted transactions.
        </Text>
      </Animated.View>

      {/* Bottom features */}
      <Animated.View style={[styles.bottomFeatures, {opacity: subtitleAnim}]}>
        <View style={styles.feature}>
          <View style={[styles.featureDot, {backgroundColor: COLORS.primary}]} />
          <Text style={styles.featureText}>ENCRYPTED</Text>
        </View>
        <View style={styles.feature}>
          <View style={[styles.featureDot, {backgroundColor: COLORS.primary}]} />
          <Text style={styles.featureText}>REAL-TIME{'\n'}SCAN</Text>
        </View>
        <View style={styles.feature}>
          <View style={[styles.featureDot, {backgroundColor: COLORS.primary}]} />
          <Text style={styles.featureText}>BIOMETRIC{'\n'}READY</Text>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.03,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: COLORS.primary,
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: COLORS.primary,
  },
  statusBar: {
    position: 'absolute',
    top: 60,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
    marginRight: 8,
  },
  statusText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 3,
  },
  shieldContainer: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  outerRing: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1,
    borderColor: COLORS.primaryGlow,
    backgroundColor: 'rgba(0, 255, 65, 0.03)',
  },
  middleRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 65, 0.15)',
    backgroundColor: 'rgba(0, 255, 65, 0.05)',
  },
  shield: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0, 255, 65, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shieldIcon: {
    fontSize: 40,
  },
  scanDot: {
    position: 'absolute',
    top: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  title: {
    textAlign: 'center',
    marginBottom: 8,
  },
  titleGreen: {
    fontSize: 42,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: 2,
  },
  titleWhite: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.textPrimary,
    letterSpacing: 1.5,
  },
  divider: {
    width: 40,
    height: 3,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
    marginVertical: 20,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
    lineHeight: 28,
  },
  description: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 22,
  },
  bottomFeatures: {
    position: 'absolute',
    bottom: 50,
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: 10,
  },
  feature: {
    alignItems: 'center',
  },
  featureDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 6,
  },
  featureText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    textAlign: 'center',
  },
});

export default SplashScreen;
