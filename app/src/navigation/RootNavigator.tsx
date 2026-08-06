import React, { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { WelcomeScreen } from '@features/auth/screens/WelcomeScreen';
import { RegisterScreen } from '@features/auth/screens/RegisterScreen';
import { LoginScreen } from '@features/auth/screens/LoginScreen';
import { ForgotPasswordScreen } from '@features/auth/screens/ForgotPasswordScreen';
import { ResetPasswordScreen } from '@features/auth/screens/ResetPasswordScreen';
import { ProfileSetupScreen } from '@features/auth/screens/ProfileSetupScreen';
import { ProfileGoalsScreen } from '@features/profile/screens/ProfileGoalsScreen';
import { ProfileCoachPersonalityScreen } from '@features/profile/screens/ProfileCoachPersonalityScreen';
import { ProfileEditScreen } from '@features/profile/screens/ProfileEditScreen';
import { EvolutionScreen } from '@features/evolution/screens/EvolutionScreen';
import { BrandTabNavigator } from './BrandTabNavigator';
import { ScannerNavigator } from './ScannerNavigator';
import { useAuthStore } from '@features/auth/store';
import { useCoachStore } from '@features/coach/store';
import { dietService } from '@shared/services/diet.service';
import type { LinkingOptions } from '@react-navigation/native';
import type { AuthStackParamList, RootStackParamList } from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

// O link do email de recuperação abre /reset-password no stack de auth.
// Nota: o linking do AuthNavigator é resolvido via getStateFromPath default
// (rota registrada no próprio AuthStack quando deslogado).
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['caloria://', 'https://caloria.app'],
  config: {
    screens: {
      App: {
        screens: {
          Community: {
            screens: {
              PostComments: 'post/:postId',
              ChallengeLeaderboard: 'challenge/:code',
            },
          },
        },
      },
    },
  },
};

/** Web: garante que /reset-password caia na tela certa mesmo deslogado. */
function isResetPasswordPath(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  return window.location.pathname.replace(/\/$/, '') === '/reset-password';
}

function isAppPreviewEnabled(): boolean {
  // H4 da spec: o bypass de login (?preview=app) é ferramenta de desenvolvimento
  // — em produção qualquer um poderia abrir o shell autenticado do app.
  if (!__DEV__) {
    return false;
  }
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return false;
  }

  return new URLSearchParams(window.location.search).get('preview') === 'app';
}

function AuthNavigator(): React.JSX.Element {
  return (
    <AuthStack.Navigator
      initialRouteName={isResetPasswordPath() ? 'ResetPassword' : 'Welcome'}
      screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
    >
      <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <AuthStack.Screen name="ResetPassword" component={ResetPasswordScreen} />
      <AuthStack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
    </AuthStack.Navigator>
  );
}

export function RootNavigator(): React.JSX.Element {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const showAuthenticatedApp = isAuthenticated || isAppPreviewEnabled();

  // Retomada pós-boot: se uma geração de dieta ficou no meio (app fechado),
  // religa o polling — sem isso a dieta ficava parcial para sempre.
  useEffect(() => {
    if (!hasHydrated || !isAuthenticated) return;
    void (async () => {
      const job = await dietService.getActiveJob();
      if (job && (job.status === 'pending' || job.status === 'running')) {
        void useCoachStore.getState().runDietGeneration(job.jobId);
      }
    })();
  }, [hasHydrated, isAuthenticated]);

  // Espera o persist reidratar a sessão antes de decidir a navegação —
  // senão o usuário logado vê a tela de login piscar a cada abertura.
  if (!hasHydrated && !isAppPreviewEnabled()) {
    return (
      <View style={splashStyles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer linking={linking}>
      {showAuthenticatedApp ? (
        <RootStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
          <RootStack.Screen name="App" component={BrandTabNavigator} />
          <RootStack.Screen
            name="ProfileGoals"
            component={ProfileGoalsScreen}
            options={{ headerShown: true, title: 'Metas e objetivos' }}
          />
          <RootStack.Screen
            name="ProfileCoachPersonality"
            component={ProfileCoachPersonalityScreen}
            options={{ headerShown: true, title: 'Personalidade do Coach' }}
          />
          <RootStack.Screen
            name="ProfileEdit"
            component={ProfileEditScreen}
            options={{ headerShown: true, title: 'Editar perfil' }}
          />
          <RootStack.Screen
            name="Evolution"
            component={EvolutionScreen}
            options={{ headerShown: true, title: 'Evolução' }}
          />
          <RootStack.Screen
            name="Scanner"
            component={ScannerNavigator}
            options={{ presentation: 'modal', headerShown: false }}
          />
        </RootStack.Navigator>
      ) : (
        <AuthNavigator />
      )}
    </NavigationContainer>
  );
}

const splashStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
