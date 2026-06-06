import React, {useRef, useCallback, useState, useEffect} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {COLORS} from '../theme';
import useSmsListener from '../hooks/useSmsListener';
import useSmsInboxSync from '../hooks/useSmsInboxSync';

// Screens
import SplashScreen from '../screens/SplashScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import DashboardScreen from '../screens/DashboardScreen';
import MessageInputScreen from '../screens/MessageInputScreen';
import ProcessingScreen from '../screens/ProcessingScreen';
import AnalysisResultScreen from '../screens/AnalysisResultScreen';
import SafeResultScreen from '../screens/SafeResultScreen';
import ThreatReportScreen from '../screens/ThreatReportScreen';
import ErrorScreen from '../screens/ErrorScreen';
import HistoryScreen from '../screens/HistoryScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

const SMS_AUTO_SCAN_KEY = '@sms_auto_scan_enabled';

// Custom Tab Bar Icon
const TabIcon = ({label, emoji, focused}) => (
  <View style={[styles.tabItem, focused && styles.tabItemActive]}>
    <Text style={[styles.tabEmoji, focused && styles.tabEmojiActive]}>
      {emoji}
    </Text>
    {focused && <View style={styles.tabDot} />}
  </View>
);

// Bottom Tab Navigator
const BottomTabs = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
      }}>
      <Tab.Screen
        name="Home"
        component={DashboardScreen}
        options={{
          tabBarIcon: ({focused}) => (
            <TabIcon label="Home" emoji="🏠" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          tabBarIcon: ({focused}) => (
            <TabIcon label="History" emoji="🕐" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Scan"
        component={MessageInputScreen}
        options={{
          tabBarIcon: ({focused}) => (
            <View style={styles.scanTabContainer}>
              <View style={styles.scanTabBtn}>
                <Text style={styles.scanTabIcon}>📡</Text>
              </View>
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({focused}) => (
            <TabIcon label="Settings" emoji="⚙️" focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

// Main Navigation
const AppNavigator = () => {
  const navigationRef = useRef(null);
  const pendingSmsEventsRef = useRef([]);
  const processedHashesRef = useRef(new Set());
  const [smsAutoScan, setSmsAutoScan] = useState(false);

  // Load the user's SMS auto-scan preference
  useEffect(() => {
    const loadPreference = async () => {
      try {
        const value = await AsyncStorage.getItem(SMS_AUTO_SCAN_KEY);
        setSmsAutoScan(value === 'true');
      } catch (error) {
        console.log('[AppNavigator] Error loading SMS preference:', error);
      }
    };
    loadPreference();

    // Poll for preference changes (set from SettingsScreen)
    const interval = setInterval(async () => {
      try {
        const value = await AsyncStorage.getItem(SMS_AUTO_SCAN_KEY);
        setSmsAutoScan(value === 'true');
      } catch (_) {}
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const processSmsEvent = useCallback(
    smsEvent => {
      const nav = navigationRef.current;
      if (!nav || !nav.isReady()) return false;

      const currentRoute = nav.getCurrentRoute();
      // Don't interrupt if already on Processing screen
      if (currentRoute?.name === 'Processing') return false;

      // Duplicate prevention hash across listener and inbox sync
      const smsHash = `${smsEvent.sender}::${smsEvent.message}`;
      if (processedHashesRef.current.has(smsHash)) {
        console.log('[AppNavigator] Ignoring duplicate SMS from:', smsEvent.sender);
        return true; // Mark as "processed" so it drops
      }

      processedHashesRef.current.add(smsHash);
      if (processedHashesRef.current.size > 20) {
        const arr = Array.from(processedHashesRef.current).slice(-10);
        processedHashesRef.current = new Set(arr);
      }

      console.log(
        '[AppNavigator] Auto-analyzing SMS from:',
        smsEvent.sender,
      );

      // Navigate to Processing screen with the SMS content
      nav.navigate('Processing', {
        message: smsEvent.message,
        type: 'text',
        autoSms: true,
        sender: smsEvent.sender,
      });
      return true;
    },
    [],
  );

  const flushPendingSmsEvents = useCallback(() => {
    const nextSmsEvent = pendingSmsEventsRef.current[0];
    if (!nextSmsEvent) return;

    if (processSmsEvent(nextSmsEvent)) {
      pendingSmsEventsRef.current.shift();
    }
  }, [processSmsEvent]);

  // Handle incoming SMS: auto-navigate to Processing screen
  const handleSmsReceived = useCallback(
    smsEvent => {
      if (processSmsEvent(smsEvent)) return;

      pendingSmsEventsRef.current.push(smsEvent);
      if (pendingSmsEventsRef.current.length > 10) {
        pendingSmsEventsRef.current.shift();
      }

      console.log('[AppNavigator] SMS queued until navigation is ready');
    },
    [processSmsEvent],
  );

  useEffect(() => {
    if (smsAutoScan) {
      flushPendingSmsEvents();
    }
  }, [smsAutoScan, flushPendingSmsEvents]);

  // Activate the SMS listener only when auto-scan is enabled
  useSmsListener(handleSmsReceived, smsAutoScan);
  useSmsInboxSync(handleSmsReceived, smsAutoScan);

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={flushPendingSmsEvents}
      onStateChange={flushPendingSmsEvents}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          cardStyle: {backgroundColor: COLORS.background},
          animationEnabled: true,
        }}>
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="MainTabs" component={BottomTabs} />
        <Stack.Screen name="Processing" component={ProcessingScreen} />
        <Stack.Screen name="AnalysisResult" component={AnalysisResultScreen} />
        <Stack.Screen name="SafeResult" component={SafeResultScreen} />
        <Stack.Screen name="ThreatReport" component={ThreatReportScreen} />
        <Stack.Screen name="Error" component={ErrorScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: COLORS.tabBarBg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
    height: 70,
    paddingBottom: 10,
    paddingTop: 10,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: -4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  tabItemActive: {},
  tabEmoji: {
    fontSize: 22,
    opacity: 0.5,
  },
  tabEmojiActive: {
    opacity: 1,
  },
  tabDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.primary,
    marginTop: 4,
  },
  scanTabContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -15,
  },
  scanTabBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 3,
    borderColor: COLORS.tabBarBg,
  },
  scanTabIcon: {
    fontSize: 22,
  },
});

export default AppNavigator;
