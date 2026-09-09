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
import { isProfileComplete, profileService } from '@shared/services/profile.service';
import type { LinkingOptions } from '@react-navigation/native';
import type { AuthStackParamList, RootStackParamList } from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

// O link do email de recuperação abre /reset-password no stack de auth.
// Nota: o linking do AuthNavigator é resolvido via getStateFromPath default
// (rota registrada no próprio AuthStack quando deslogado).
const linking: LinkingOptions<RootStackParamList> = {
  /**
   * Só o esquema próprio. 'https://caloria.app' estava declarado aqui mas
   * nunca funcionou em NENHUMA das duas plataformas, porque link https exige
   * verificação de domínio que não existe:
   *
   *   - iOS: entitlement com.apple.developer.associated-domains + o arquivo
   *     apple-app-site-association servido no domínio;
   *   - Android: intent-filter com android:scheme="https" e autoVerify, mais
   *     o assetlinks.json no domínio. O AndroidManifest só declara o
   *     intent-filter do esquema "caloria".
   *
   * Para religar, fazer os dois lados acima e devolver o prefixo aqui.
   */
  prefixes: ['caloria://'],
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

function AuthNavigator({ startAtProfileSetup = false }: { startAtProfileSetup?: boolean }): React.JSX.Element {
  // R6: quem já tem sessão e só não terminou o perfil não pode cair no Welcome
  // — seria pedir login a quem acabou de logar. Vai direto ao passo que falta.
  const initialRouteName = startAtProfileSetup
    ? 'ProfileSetup'
    : isResetPasswordPath()
      ? 'ResetPassword'
      : 'Welcome';

  return (
    <AuthStack.Navigator
      initialRouteName={initialRouteName}
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
  const profileComplete = useAuthStore((state) => state.profileComplete);
  const setProfileComplete = useAuthStore((state) => state.setProfileComplete);

  // R6: estar autenticado não basta. Quem abandonou o ProfileSetup no meio e
  // depois fez login caía no dashboard sem altura, peso nem objetivo — e sem
  // eles o backend não gera dieta nenhuma, então o painel ficava para sempre
  // sem metas (e o R5 preenchia o buraco com números inventados).
  const showAuthenticatedApp =
    (isAuthenticated && profileComplete === true) || isAppPreviewEnabled();

  // `profileComplete` é persistido: quem já foi verificado não paga splash de
  // novo. Só fica indeterminado na primeira abertura depois desta versão.
  const checkingProfile = isAuthenticated && profileComplete === null;

  useEffect(() => {
    if (!hasHydrated || !isAuthenticated || profileComplete !== null) return;
    let active = true;
    void profileService
      .getMe()
      .then((profile) => {
        if (active) setProfileComplete(isProfileComplete(profile));
      })
      .catch(() => {
        // Offline ou servidor fora NÃO é motivo para mandar alguém refazer o
        // onboarding — nem para deixar o app preso num splash eterno.
        if (active) setProfileComplete(true);
      });
    return () => {
      active = false;
    };
  }, [hasHydrated, isAuthenticated, profileComplete, setProfileComplete]);

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
  if ((!hasHydrated || checkingProfile) && !isAppPreviewEnabled()) {
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
        <AuthNavigator startAtProfileSetup={isAuthenticated && profileComplete === false} />
      )}
    </NavigationContainer>
  );
}

const splashStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
