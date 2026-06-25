import React from 'react';
import {
  BottomTabNavigationOptions,
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';
import { StyleSheet, View } from 'react-native';
import { DashboardScreen } from '@features/dashboard/screens/DashboardScreen';
import { FoodLogScreen } from '@features/food-log/screens/FoodLogScreen';
import { CoachScreen } from '@features/coach/screens/CoachScreen';
import { ProfileScreen } from '@features/profile/screens/ProfileScreen';
import { colors, typography } from '@theme';
import type { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

function TabIcon({ routeName, color, focused }: { routeName: keyof TabParamList; color: string; focused: boolean }): React.JSX.Element {
  const tint = focused ? color : `${color}B8`;

  if (routeName === 'Dashboard') {
    return (
      <View style={styles.iconFrame}>
        <View style={styles.grid}>
          {[0, 1, 2, 3].map((cell) => (
            <View
              key={cell}
              style={[
                styles.gridCell,
                { borderColor: tint, backgroundColor: focused && cell === 0 ? colors.brandPrimary : colors.transparent },
              ]}
            />
          ))}
        </View>
      </View>
    );
  }

  if (routeName === 'FoodLog') {
    return (
      <View style={styles.iconFrame}>
        {[0, 1, 2].map((line) => (
          <View key={line} style={[styles.diaryLine, { backgroundColor: tint, width: line === 2 ? 11 : 15 }]} />
        ))}
      </View>
    );
  }

  if (routeName === 'Coach') {
    return (
      <View style={styles.iconFrame}>
        <View style={[styles.coachBubble, { borderColor: tint }]}>
          <View style={styles.coachDots}>
            {[0, 1, 2].map((dot) => (
              <View key={dot} style={[styles.dot, { backgroundColor: tint }]} />
            ))}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.iconFrame}>
      <View style={[styles.profileHead, { borderColor: tint }]} />
      <View style={[styles.profileBody, { borderColor: tint }]} />
    </View>
  );
}

function getScreenOptions({ route }: { route: { name: keyof TabParamList } }): BottomTabNavigationOptions {
  return {
    headerShown: false,
    tabBarActiveTintColor: colors.brandPrimary,
    tabBarInactiveTintColor: colors.brandAnchor,
    tabBarHideOnKeyboard: true,
    tabBarLabelStyle: styles.tabLabel,
    tabBarItemStyle: styles.tabItem,
    tabBarStyle: {
      height: 74,
      paddingTop: 8,
      paddingBottom: 10,
      backgroundColor: colors.brandBackground,
      borderTopColor: colors.brandDivider,
      borderTopWidth: 1,
      elevation: 0,
      shadowOpacity: 0,
    },
    tabBarIcon: ({ color, focused }) => <TabIcon routeName={route.name} color={color} focused={focused} />,
  };
}

export function BrandTabNavigator(): React.JSX.Element {
  return (
    <Tab.Navigator screenOptions={getScreenOptions}>
      <Tab.Screen name='Dashboard' component={DashboardScreen} options={{ title: 'Dashboard' }} />
      <Tab.Screen name='FoodLog' component={FoodLogScreen} options={{ title: 'Diario' }} />
      <Tab.Screen name='Coach' component={CoachScreen} options={{ title: 'Coach' }} />
      <Tab.Screen name='Profile' component={ProfileScreen} options={{ title: 'Perfil' }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabLabel: {
    fontSize: 11,
    fontFamily: typography.fontFamily.semiBold,
    marginBottom: 2,
  },
  tabItem: {
    minHeight: 44,
    paddingHorizontal: 4,
  },
  iconFrame: { width: 22, height: 18, alignItems: 'center', justifyContent: 'center' },
  grid: { width: 16, height: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  gridCell: { width: 7, height: 7, borderRadius: 2, borderWidth: 1.3 },
  diaryLine: { height: 2, borderRadius: 999, marginVertical: 1.5 },
  coachBubble: { width: 18, height: 14, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  coachDots: { flexDirection: 'row', gap: 2 },
  dot: { width: 2.5, height: 2.5, borderRadius: 999 },
  profileHead: { width: 8, height: 8, borderRadius: 999, borderWidth: 1.5, marginBottom: 1.5 },
  profileBody: { width: 14, height: 7, borderTopLeftRadius: 8, borderTopRightRadius: 8, borderWidth: 1.5, borderBottomWidth: 0 },
});
