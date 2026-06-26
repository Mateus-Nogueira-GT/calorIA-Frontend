import React from 'react';
import {
  BottomTabNavigationOptions,
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { DashboardScreen } from '@features/dashboard/screens/DashboardScreen';
import { FoodLogScreen } from '@features/food-log/screens/FoodLogScreen';
import { CoachScreen } from '@features/coach/screens/CoachScreen';
import { ProfileScreen } from '@features/profile/screens/ProfileScreen';
import { EvolutionScreen } from '@features/evolution/screens/EvolutionScreen';
import { CommunityNavigator } from './CommunityNavigator';
import { colors, typography } from '@theme';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

function CameraTabButton({ onPress }: { onPress: () => void }): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      style={styles.cameraButton}
      accessibilityRole='button'
      accessibilityLabel='Escanear refeição'
    >
      <View style={styles.cameraInner}>
        {/* Ícone de câmera desenhado */}
        <View style={styles.cameraBody}>
          <View style={styles.cameraLens} />
          <View style={styles.cameraFlash} />
        </View>
      </View>
    </Pressable>
  );
}

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

  if (routeName === 'Evolution') {
    return (
      <View style={styles.iconFrame}>
        <View style={styles.evolutionBars}>
          {[0.4, 0.7, 0.55, 1.0, 0.8].map((h, i) => (
            <View key={i} style={[styles.evolutionBar, { height: 14 * h, backgroundColor: tint }]} />
          ))}
        </View>
      </View>
    );
  }

  if (routeName === 'Community') {
    return (
      <View style={styles.iconFrame}>
        <View style={styles.communityRow}>
          <View style={[styles.communityHead, { borderColor: tint }]} />
          <View style={[styles.communityHead, { borderColor: tint, marginLeft: -3 }]} />
        </View>
        <View style={[styles.communityBody, { borderColor: tint }]} />
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
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <Tab.Navigator screenOptions={getScreenOptions}>
      <Tab.Screen name='Dashboard' component={DashboardScreen} options={{ title: 'Dashboard' }} />
      <Tab.Screen name='FoodLog' component={FoodLogScreen} options={{ title: 'Diário' }} />
      <Tab.Screen
        name='CameraAction'
        component={DashboardScreen}
        options={{
          tabBarButton: () => (
            <CameraTabButton onPress={() => rootNavigation.navigate('Scanner')} />
          ),
        }}
      />
      <Tab.Screen name='Coach' component={CoachScreen} options={{ title: 'Coach' }} />
      <Tab.Screen name='Community' component={CommunityNavigator} options={{ title: 'Comunidade' }} />
      <Tab.Screen name='Profile' component={ProfileScreen} options={{ title: 'Perfil' }} />
      <Tab.Screen name='Evolution' component={EvolutionScreen} options={{ title: 'Evolução' }} />
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
  evolutionBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  evolutionBar: { width: 3, borderRadius: 2 },
  // Botão central de câmera
  cameraButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -16,
    shadowColor: colors.brandPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  cameraBody: {
    width: 22,
    height: 17,
    borderRadius: 3,
    borderWidth: 2,
    borderColor: colors.brandBackground,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  cameraLens: {
    width: 9,
    height: 9,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.brandBackground,
  },
  cameraFlash: {
    position: 'absolute',
    top: -5,
    right: 3,
    width: 5,
    height: 3,
    borderRadius: 1,
    borderWidth: 1.5,
    borderColor: colors.brandBackground,
  },
  communityRow: { flexDirection: 'row' },
  communityHead: { width: 6, height: 6, borderRadius: 999, borderWidth: 1.4 },
  communityBody: { width: 16, height: 7, borderTopLeftRadius: 8, borderTopRightRadius: 8, borderWidth: 1.4, borderBottomWidth: 0, marginTop: 1.5 },
});
