import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { WelcomeScreen } from '@features/auth/screens/WelcomeScreen';
import { RegisterScreen } from '@features/auth/screens/RegisterScreen';
import { ProfileSetupScreen } from '@features/auth/screens/ProfileSetupScreen';
import { TabNavigator } from './TabNavigator';
import { useAuthStore } from '@features/auth/store';
import type { RootStackParamList, AuthStackParamList } from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

function AuthNavigator(): React.JSX.Element {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
      <AuthStack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
    </AuthStack.Navigator>
  );
}

export function RootNavigator(): React.JSX.Element {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return (
    <NavigationContainer>
      {isAuthenticated ? (
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
          <RootStack.Screen name="App" component={TabNavigator} />
        </RootStack.Navigator>
      ) : (
        <AuthNavigator />
      )}
    </NavigationContainer>
  );
}
