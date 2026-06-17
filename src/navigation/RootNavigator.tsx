import React from 'react';
import { Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { WelcomeScreen } from '@features/auth/screens/WelcomeScreen';
import { RegisterScreen } from '@features/auth/screens/RegisterScreen';
import { LoginScreen } from '@features/auth/screens/LoginScreen';
import { ForgotPasswordScreen } from '@features/auth/screens/ForgotPasswordScreen';
import { ProfileSetupScreen } from '@features/auth/screens/ProfileSetupScreen';
import { ProfileGoalsScreen } from '@features/profile/screens/ProfileGoalsScreen';
import { ProfileCoachPersonalityScreen } from '@features/profile/screens/ProfileCoachPersonalityScreen';
import { BrandTabNavigator } from './BrandTabNavigator';
import { useAuthStore } from '@features/auth/store';
import type { AuthStackParamList, RootStackParamList } from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

function isAppPreviewEnabled(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return false;
  }

  return new URLSearchParams(window.location.search).get('preview') === 'app';
}

function AuthNavigator(): React.JSX.Element {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name='Welcome' component={WelcomeScreen} />
      <AuthStack.Screen name='Register' component={RegisterScreen} />
      <AuthStack.Screen name='Login' component={LoginScreen} />
      <AuthStack.Screen name='ForgotPassword' component={ForgotPasswordScreen} />
      <AuthStack.Screen name='ProfileSetup' component={ProfileSetupScreen} />
    </AuthStack.Navigator>
  );
}

export function RootNavigator(): React.JSX.Element {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const showAuthenticatedApp = isAuthenticated || isAppPreviewEnabled();

  return (
    <NavigationContainer>
      {showAuthenticatedApp ? (
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
          <RootStack.Screen name='App' component={BrandTabNavigator} />
          <RootStack.Screen
            name='ProfileGoals'
            component={ProfileGoalsScreen}
            options={{ headerShown: true, title: 'Metas e objetivos' }}
          />
          <RootStack.Screen
            name='ProfileCoachPersonality'
            component={ProfileCoachPersonalityScreen}
            options={{ headerShown: true, title: 'Personalidade do Coach' }}
          />
        </RootStack.Navigator>
      ) : (
        <AuthNavigator />
      )}
    </NavigationContainer>
  );
}
