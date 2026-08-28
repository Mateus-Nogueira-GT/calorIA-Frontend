import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { authService } from '@shared/services/auth.service';
import { getAppleSignInPayload, isAppleSignInAvailable } from '@shared/services/apple-signin.service';
import { getGoogleIdToken, isGoogleSignInAvailable } from '@shared/services/google-signin.service';
import { useAuthStore } from '@features/auth/store';
import { isNetworkError } from '@shared/utils/api-error';
import { Button, Input, Text } from '@shared/components';
import { colors, typography, spacing, radius } from '@theme';
import type { AuthStackScreenProps } from '@navigation/types';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const loginButtonLabel = 'Entrar';
const googleButtonLabel = 'Continuar com Google';
const appleButtonLabel = 'Continuar com Apple';
const registerFooterLabel = 'Não tem conta? Criar conta';
const titleLabel = 'Entrar';
const subtitleLabel = 'Continue seu plano com o coach de nutrição inteligente.';

const interfaceFont = Platform.select({
  web: '"DM Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  default: typography.fontFamily.regular,
});

const interfaceSemiBoldFont = Platform.select({
  web: '"DM Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  default: typography.fontFamily.semiBold,
});

export function LoginScreen({ navigation }: AuthStackScreenProps<'Login'>): React.JSX.Element {
  const hasSocialAuth = isGoogleSignInAvailable || isAppleSignInAvailable;
  const setToken = useAuthStore((s) => s.setToken);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(false);

  /**
   * Teclados Android completam o e-mail com um espaço no fim. Normalizamos na
   * origem: sem isso o botão ficava desabilitado (toque morto) com o e-mail
   * visualmente correto na tela.
   */
  function handleEmailChange(v: string) {
    setEmail(v.trim());
  }

  function validateEmail(v: string) {
    setEmailError(!isValidEmail(v) ? 'E-mail inválido' : '');
  }
  function validatePassword(v: string) {
    setPasswordError(v.length < 8 ? 'Senha deve ter no mínimo 8 caracteres' : '');
  }

  const isFormValid = isValidEmail(email) && password.length >= 8;

  async function handleLogin() {
    setLoading(true);
    try {
      const res = await authService.login({ email, password });
      setToken(res.token, res.user, res.refreshToken);
    } catch (err) {
      Alert.alert(
        'Erro',
        isNetworkError(err)
          ? 'Não foi possível falar com o servidor. Verifique sua conexão e tente novamente.'
          : 'Credenciais inválidas. Verifique e tente novamente.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    try {
      const idToken = await getGoogleIdToken();
      const res = await authService.loginWithGoogle(idToken);
      setToken(res.token, res.user, res.refreshToken);
    } catch {
      Alert.alert('Erro', 'Login com Google falhou.');
    } finally {
      setLoading(false);
    }
  }

  async function handleApple() {
    setLoading(true);
    try {
      const { identityToken, fullName } = await getAppleSignInPayload();
      const res = await authService.loginWithApple(identityToken, fullName);
      setToken(res.token, res.user, res.refreshToken);
    } catch {
      Alert.alert('Erro', 'Login com Apple falhou.');
    } finally {
      setLoading(false);
    }
  }

  return (
    // A6: sem o KAV o teclado cobria o campo de senha e o botão em telas
    // pequenas — o usuário não via o que digitava nem alcançava o Entrar.
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text
          accessibilityRole="header"
          variant="heading1"
          style={styles.logo}
        >
          calor<Text variant="heading1" style={styles.logoAccent}>IA</Text>
        </Text>
        <Text variant="heading2" style={styles.title}>{titleLabel}</Text>
        <Text variant="body" style={styles.subtitle}>{subtitleLabel}</Text>
      </View>

      <Input
        label="E-mail"
        placeholder="seu@email.com"
        value={email}
        onChangeText={handleEmailChange}
        onBlur={() => validateEmail(email)}
        error={emailError}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <Input
        label="Senha"
        placeholder="Sua senha"
        value={password}
        onChangeText={setPassword}
        onBlur={() => validatePassword(password)}
        error={passwordError}
        secureTextEntry
      />

      <TouchableOpacity
        onPress={() => navigation.navigate('ForgotPassword')}
        style={styles.forgotLink}
      >
        <Text variant="caption" style={styles.linkText}>Esqueci minha senha</Text>
      </TouchableOpacity>

      <Button
        onPress={handleLogin}
        loading={loading}
        disabled={!isFormValid}
        testID="login-btn"
        size="lg"
        style={[styles.btn, styles.primaryButton]}
        labelStyle={styles.primaryButtonLabel}
      >
        {loginButtonLabel}
      </Button>

      {hasSocialAuth ? (
        <>
          <View style={styles.divider}>
            <View style={styles.line} />
            <Text variant="caption" style={styles.orText}>ou</Text>
            <View style={styles.line} />
          </View>

          {isGoogleSignInAvailable ? (
            <Button
              variant="secondary"
              onPress={handleGoogle}
              size="lg"
              style={[styles.btn, styles.secondaryButton]}
              labelStyle={styles.secondaryButtonLabel}
            >
              {googleButtonLabel}
            </Button>
          ) : null}

          {isAppleSignInAvailable ? (
            <Button
              variant="secondary"
              onPress={handleApple}
              size="lg"
              style={[styles.btn, styles.secondaryButton]}
              labelStyle={styles.secondaryButtonLabel}
            >
              {appleButtonLabel}
            </Button>
          ) : null}
        </>
      ) : null}

      <Button
        variant="ghost"
        onPress={() => navigation.replace('Register')}
        size="md"
        style={styles.footerButton}
        labelStyle={styles.footerButtonLabel}
      >
        {registerFooterLabel}
      </Button>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.brandBackground },
  container: {
    alignSelf: 'center',
    backgroundColor: colors.brandBackground,
    flexGrow: 1,
    maxWidth: 420,
    padding: spacing.xxl,
    paddingTop: 54,
    width: '100%',
  },
  header: { alignItems: 'center', marginBottom: 30 },
  logo: {
    color: colors.brandAnchor,
    fontFamily: interfaceSemiBoldFont,
    fontSize: 38,
    lineHeight: 44,
    textAlign: 'center',
  },
  logoAccent: {
    color: colors.brandPrimary,
    fontFamily: interfaceSemiBoldFont,
    fontSize: 38,
    lineHeight: 44,
  },
  title: {
    color: colors.brandAnchor,
    fontFamily: interfaceSemiBoldFont,
    marginTop: 28,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.brandText,
    fontFamily: interfaceFont,
    marginTop: 10,
    maxWidth: 310,
    textAlign: 'center',
  },
  forgotLink: { alignSelf: 'flex-end', marginBottom: spacing.xxl, marginTop: -8 },
  linkText: { color: colors.brandPrimary, fontFamily: interfaceFont },
  btn: { borderRadius: radius.lg, marginBottom: spacing.md, minHeight: 52, paddingVertical: 0 },
  primaryButton: { backgroundColor: colors.brandPrimary },
  primaryButtonLabel: {
    color: colors.brandAnchor,
    fontFamily: interfaceSemiBoldFont,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semiBold,
  },
  secondaryButton: {
    backgroundColor: colors.transparent,
    borderColor: colors.brandAnchor,
    borderWidth: 1.5,
  },
  secondaryButtonLabel: {
    color: colors.brandAnchor,
    fontFamily: interfaceSemiBoldFont,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semiBold,
  },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.lg, gap: spacing.md },
  line: { flex: 1, height: 1, backgroundColor: colors.brandDivider },
  orText: { color: colors.brandText, fontFamily: interfaceFont },
  footerButton: { marginTop: 10, minHeight: 44, paddingHorizontal: spacing.lg },
  footerButtonLabel: { color: colors.brandPrimary, fontFamily: interfaceSemiBoldFont, fontSize: typography.fontSize.sm },
});
