import React from 'react';
import {
  createBottomTabNavigator,
  BottomTabNavigationOptions,
} from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { DashboardScreen } from '@features/dashboard/screens/DashboardScreen';
import { FoodLogScreen } from '@features/food-log/screens/FoodLogScreen';
import { CoachScreen } from '@features/coach/screens/CoachScreen';
import { ProfileScreen } from '@features/profile/screens/ProfileScreen';
import { colors, typography } from '@theme';
import type { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

const tabIcons: Partial<Record<keyof TabParamList, string>> = {
  Dashboard: '🏠',
  FoodLog: '📋',
  Coach: '🤖',
  Profile: '👤',
};

function TabIcon({ routeName }: { routeName: keyof TabParamList }): React.JSX.Element {
  return <Text style={styles.tabIcon}>{tabIcons[routeName]}</Text>;
}

function getScreenOptions({
  route,
}: {
  route: { name: keyof TabParamList };
}): BottomTabNavigationOptions {
  return {
    headerShown: false,
    tabBarActiveTintColor: colors.brandPrimary,
    tabBarInactiveTintColor: colors.brandAnchor,
    tabBarStyle: {
      backgroundColor: colors.brandBackground,
      borderTopColor: colors.brandDivider,
    },
    tabBarIcon: () => <TabIcon routeName={route.name} />,
  };
}

export function TabNavigator(): React.JSX.Element {
  return (
    <Tab.Navigator
      screenOptions={getScreenOptions}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="FoodLog" component={FoodLogScreen} options={{ title: 'Diário' }} />
      <Tab.Screen name="Coach" component={CoachScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Perfil' }} />
    </Tab.Navigator>
  );
}

const styles = {
  tabIcon: {
    fontSize: typography.fontSize.lg,
  },
};
