import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { DashboardScreen } from '@features/dashboard/screens/DashboardScreen';
import { FoodLogScreen } from '@features/food-log/screens/FoodLogScreen';
import { ScannerScreen } from '@features/scanner/screens/ScannerScreen';
import { CoachScreen } from '@features/coach/screens/CoachScreen';
import { ProfileScreen } from '@features/profile/screens/ProfileScreen';
import { colors } from '@theme';
import type { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

const tabIcons: Record<keyof TabParamList, string> = {
  Dashboard: '🏠',
  FoodLog: '📋',
  Scanner: '📷',
  Coach: '🤖',
  Profile: '👤',
};

export function TabNavigator(): React.JSX.Element {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.tabBarActive,
        tabBarInactiveTintColor: colors.tabBarInactive,
        tabBarStyle: {
          backgroundColor: colors.tabBarBackground,
          borderTopColor: colors.border,
        },
        tabBarIcon: ({ color }) => (
          <Text style={{ fontSize: 20, color }}>{tabIcons[route.name]}</Text>
        ),
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="FoodLog" component={FoodLogScreen} options={{ title: 'Diário' }} />
      <Tab.Screen name="Scanner" component={ScannerScreen} />
      <Tab.Screen name="Coach" component={CoachScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Perfil' }} />
    </Tab.Navigator>
  );
}
