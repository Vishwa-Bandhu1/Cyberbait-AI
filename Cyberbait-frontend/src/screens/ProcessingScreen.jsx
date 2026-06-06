import React, {useCallback, useEffect, useRef, useState} from 'react';
import {View, Text, StyleSheet, Animated, Dimensions} from 'react-native';
import {COLORS} from '../theme';
import {analyzeMessage, analyzeImage} from '../services/api';

const {width} = Dimensions.get('window');

const ProcessingScreen = ({route, navigation}) => {
  const {message, sender, imageFile, type} = route.params;
  const [statusText, setStatusText] = useState('Initializing AI Engine...');

  const pulseAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const dotAnim = useRef(new Animated.Value(0)).current;

  const performAnalysis = useCallback(async () => {
    console.log(`[Processing] performAnalysis started. Type: ${type}`);
    try {
      let result;
      console.log(`[Processing] Sending API request to backend...`);
      if (type === 'image' && imageFile) {
        result = await analyzeImage(imageFile);
      } else {
        result = await analyzeMessage(message, {sender});
      }

      console.log(`[Processing] API response received and parsed successfully.`);
      console.log(`[Processing] AI Response Result: IsThreat=${result.isThreat}, RiskScore=${result.riskScore}, ThreatLevel=${result.threatLevel}`);

      // Navigate to appropriate result screen
      if (result.riskScore > 40) {
        console.log(`[Processing] Triggering navigation: Final Screen = AnalysisResult (Threat)`);
        navigation.replace('AnalysisResult', {result, sender});
      } else {
        console.log(`[Processing] Triggering navigation: Final Screen = SafeResult (Safe)`);
        navigation.replace('SafeResult', {result, sender});
      }
    } catch (error) {
      console.error('[Processing] Analysis error:', error);
      const errorType = error.response?.data?.error || 'API_ERROR';
      const errorMessage =
        error.response?.data?.message || error.message || 'Analysis failed';
      console.log(`[Processing] Triggering navigation: Final Screen = Error (${errorType})`);

      navigation.replace('Error', {
        errorType,
        errorMessage,
        retryParams: route.params,
      });
    }
  }, [imageFile, message, navigation, route.params, sender, type]);

  useEffect(() => {
    // Pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
    ).start();

    // Rotate animation
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 3000,
        useNativeDriver: true,
      }),
    ).start();

    // Dot blink
    Animated.loop(
      Animated.sequence([
        Animated.timing(dotAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(dotAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    ).start();

    // Progress simulation
    const stages = [
      {text: 'Parsing message content...', progress: 0.2},
      {text: 'Running NLP analysis...', progress: 0.4},
      {text: 'Extracting entities...', progress: 0.6},
      {text: 'Computing risk score...', progress: 0.8},
      {text: 'Generating report...', progress: 0.95},
    ];

    stages.forEach((stage, index) => {
      setTimeout(() => {
        setStatusText(stage.text);
        Animated.timing(progressAnim, {
          toValue: stage.progress,
          duration: 400,
          useNativeDriver: false,
        }).start();
      }, (index + 1) * 800);
    });

    // API Call
    performAnalysis();
  }, [dotAnim, performAnalysis, progressAnim, pulseAnim, rotateAnim]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      {/* Background grid */}
      <View style={styles.gridBg}>
        {Array.from({length: 12}).map((_, i) => (
          <View key={i} style={[styles.gridLine, {top: i * 70}]} />
        ))}
      </View>

      {/* Scanning visualization */}
      <View style={styles.scanContainer}>
        {/* Outer glow rings */}
        <Animated.View
          style={[
            styles.outerRing3,
            {
              opacity: pulseAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.05, 0.15],
              }),
              transform: [
                {
                  scale: pulseAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.2],
                  }),
                },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.outerRing2,
            {
              opacity: pulseAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.1, 0.25],
              }),
            },
          ]}
        />
        <Animated.View
          style={[
            styles.outerRing1,
            {transform: [{rotate: spin}]},
          ]}>
          {/* Scanning dot on ring */}
          <View style={styles.ringDot} />
        </Animated.View>

        {/* Center icon */}
        <View style={styles.centerIcon}>
          <Animated.Text
            style={[
              styles.iconText,
              {
                opacity: pulseAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.7, 1],
                }),
              },
            ]}>
            🔍
          </Animated.Text>
        </View>
      </View>

      {/* Title */}
      <Text style={styles.title}>Analyzing with AI</Text>

      {/* Status text */}
      <View style={styles.statusContainer}>
        <Animated.View style={[styles.statusDot, {opacity: dotAnim}]} />
        <Text style={styles.statusText}>{statusText}</Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>
      </View>

      {/* Bottom text */}
      <Text style={styles.bottomText}>
        🔒 Processing securely on encrypted channels
      </Text>
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
  gridBg: {
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
  scanContainer: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  outerRing3: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(0, 255, 65, 0.05)',
  },
  outerRing2: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 65, 0.15)',
  },
  outerRing1: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
  },
  ringDot: {
    position: 'absolute',
    top: -5,
    left: '50%',
    marginLeft: -5,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  centerIcon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(0, 255, 65, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 16,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
    marginRight: 8,
  },
  statusText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  progressContainer: {
    width: '100%',
    marginBottom: 40,
  },
  progressTrack: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 2,
    shadowColor: COLORS.primary,
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  bottomText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
});

export default ProcessingScreen;
