import React, {useState, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ScrollView,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NeonButton from '../components/NeonButton';
import {COLORS} from '../theme';

const {width, height} = Dimensions.get('window');

const ONBOARDING_DATA = [
  {
    id: 1,
    title: 'Advanced ',
    titleHighlight: 'AI\nDetection',
    description:
      'Stay ahead of scammers with our cutting-edge AI that identifies threats in real-time.',
    icon: '🔍',
    cardTitle: 'INCOMING MESSAGE',
    cardText: '"Urgent: Your account access has been restricted. Click here to verify your identity immediately."',
    cardLabel: 'SCANNING...',
  },
  {
    id: 2,
    title: 'Privacy-First\n',
    titleHighlight: 'Approach',
    description:
      'Your data never leaves your device. We scan locally to ensure total anonymity.',
    icon: '🔒',
    badge: 'MILITARY GRADE ENCRYPTION ACTIVE',
  },
  {
    id: 3,
    title: 'Real-time ',
    titleHighlight: 'Protection',
    description:
      'Automatic scanning of incoming SMS and alerts for suspicious links and calls.',
    icon: '🛡️',
    badge: 'AES-256 ENCRYPTED VAULT',
    isLast: true,
  },
];

const OnboardingScreen = ({navigation}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef(null);

  const handleNext = async () => {
    if (currentIndex < ONBOARDING_DATA.length - 1) {
      const nextIndex = currentIndex + 1;
      scrollRef.current?.scrollTo({x: nextIndex * width, animated: true});
      setCurrentIndex(nextIndex);
    } else {
      await AsyncStorage.setItem('onboarding_complete', 'true');
      navigation.replace('MainTabs');
    }
  };

  const renderPage = (item, index) => {
    return (
      <View key={item.id} style={[styles.page, {width}]}>
        {/* Illustration area */}
        <View style={styles.illustrationContainer}>
          <View style={styles.illustrationCard}>
            {item.cardTitle ? (
              <>
                <View style={styles.cardHeader}>
                  <Text style={styles.shieldEmoji}>🛡️</Text>
                  <View style={styles.cardHeaderLine} />
                </View>
                <View style={styles.messageBox}>
                  <Text style={styles.cardTitleText}>{item.cardTitle}</Text>
                  <Text style={styles.cardMessageText}>{item.cardText}</Text>
                  <View style={styles.scanningBadge}>
                    <Text style={styles.scanningText}>{item.cardLabel}</Text>
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.iconCenter}>
                <Text style={styles.bigIcon}>{item.icon}</Text>
                <View style={styles.iconGlow} />
              </View>
            )}
          </View>
        </View>

        {/* Text content */}
        <View style={styles.textContainer}>
          <Text style={styles.title}>
            {item.title}
            <Text style={styles.titleHighlight}>{item.titleHighlight}</Text>
          </Text>
          <Text style={styles.description}>{item.description}</Text>
        </View>

        {/* Page indicators */}
        <View style={styles.indicators}>
          {ONBOARDING_DATA.map((_, idx) => (
            <View
              key={idx}
              style={[
                styles.dot,
                idx === currentIndex && styles.dotActive,
              ]}
            />
          ))}
        </View>

        {/* Button */}
        <View style={styles.buttonContainer}>
          <NeonButton
            title={item.isLast ? 'GET STARTED' : 'Next  →'}
            onPress={handleNext}
          />
        </View>

        {/* Bottom badge */}
        {item.badge && (
          <View style={styles.bottomBadge}>
            <Text style={styles.badgeIcon}>{item.isLast ? '🔒' : '🛡️'}</Text>
            <Text style={styles.badgeText}>{item.badge}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        onScroll={Animated.event(
          [{nativeEvent: {contentOffset: {x: scrollX}}}],
          {useNativeDriver: false},
        )}>
        {ONBOARDING_DATA.map(renderPage)}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  page: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingTop: 60,
  },
  illustrationContainer: {
    width: '100%',
    height: height * 0.38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustrationCard: {
    width: '90%',
    height: '90%',
    backgroundColor: COLORS.cardBackground,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 20,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  shieldEmoji: {
    fontSize: 22,
  },
  cardHeaderLine: {
    flex: 1,
    height: 3,
    backgroundColor: COLORS.primaryGlow,
    borderRadius: 2,
    marginLeft: 12,
  },
  messageBox: {
    backgroundColor: 'rgba(0, 255, 65, 0.05)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 65, 0.1)',
  },
  cardTitleText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2,
    marginBottom: 8,
  },
  cardMessageText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'monospace',
  },
  scanningBadge: {
    alignSelf: 'flex-end',
    backgroundColor: COLORS.primaryGlow,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 12,
  },
  scanningText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  iconCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigIcon: {
    fontSize: 80,
  },
  iconGlow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(0, 255, 65, 0.08)',
  },
  textContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.textPrimary,
    textAlign: 'center',
    lineHeight: 40,
  },
  titleHighlight: {
    color: COLORS.primary,
  },
  description: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 24,
    paddingHorizontal: 10,
  },
  indicators: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 4,
  },
  dotActive: {
    width: 28,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  buttonContainer: {
    width: '100%',
    marginTop: 30,
  },
  bottomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
  },
  badgeIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  badgeText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2,
  },
});

export default OnboardingScreen;
