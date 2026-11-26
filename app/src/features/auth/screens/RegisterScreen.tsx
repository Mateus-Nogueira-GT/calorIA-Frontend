import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { authService, isConfirmationRequired } from '@shared/services/auth.service';
import { getAppleSignInPayload, isAppleSignInAvailable } from '@shared/services/apple-signin.service';
import { getGoogleIdToken, isGoogleSignInAvailable } from '@shared/services/google-signin.service';
import { useAuthStore } from '@features/auth/store';
import { loginErrorMessage } from '@features/auth/login-error';
import { isNetworkError, statusOf } from '@shared/utils/api-error';
import { Button, Input, Text } from '@shared/components';
import { colors, typography, spacing, radius } from '@theme';
import type { AuthStackScreenProps } from '@navigation/types';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const registerButtonLabel = 'Criar conta';
const googleButtonLabel = 'Continuar com Google';
const appleButtonLabel = 'Continuar com Apple';
const loginFooterLabel = 'Já tem conta? Entrar';
const titleLabel = 'Criar conta';
const subtitleLabel = 'Monte seu perfil para receber um plano de nutrição com IA.';
const confirmTitleLabel = 'Confirme seu e-mail';
const confirmedLoginLabel = 'Já confirmei, entrar';
const resendLabel = 'Reenviar e-mail';
const otherEmailLabel = 'Usar outro e-mail';

const interfaceFont = Platform.select({
  web: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  default: typography.fontFamily.regular,
});

const interfaceSemiBoldFont = Platform.select({
  web: '"Inter-SemiBold", Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  default: typography.fontFamily.semiBold,
});

export function RegisterScreen({ navigation }: AuthStackScreenProps<'Register'>): React.JSX.Element {
  const hasSocialAuth = isGoogleSignInAvailable || isAppleSignInAvailable;
  const setPendingAuth = useAuthStore((s) => s.setPendingAuth);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(false);
  /**
   * A4: e-mail aguardando confirmação. Fica só no estado da tela (a senha
   * também), sem ir para params de navegação nem para o storage. Nada aqui
   * limpa o scanner nem o convite pendente: quem veio do "Criar conta para
   * salvar" ou do gate de convite volta para o mesmo onboarding.
   */
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);

  function validateName(v: string) {
    setNameError(v.length < 2 ? 'Nome deve ter no mínimo 2 caracteres' : '');
  }
  /** Ver LoginScreen: teclados Android acrescentam espaço ao autocompletar. */
  function handleEmailChange(v: string) {
    setEmail(v.trim());
  }

  function validateEmail(v: string) {
    setEmailError(!isValidEmail(v) ? 'E-mail inválido' : '');
  }
  function validatePassword(v: string) {
    setPasswordError(v.length < 8 ? 'Senha deve ter no mínimo 8 caracteres' : '');
  }

  const isFormValid =
    name.length >= 2 && isValidEmail(email) && password.length >= 8;

  async function handleRegister() {
    setLoading(true);
    try {
      const res = await authService.register({ name, email, password });
      if (isConfirmationRequired(res)) {
        setConfirmEmail(res.email || email);
        return;
      }
      setPendingAuth(res.token, res.user, res.refreshToken);
      navigation.navigate('ProfileSetup');
    } catch (err) {
      // O backend responde 409 EMAIL_ALREADY_EXISTS; sem tratar, quem já tinha
      // conta lia "tente novamente" e ficava em loop no cadastro.
      if (statusOf(err) === 409) {
        Alert.alert('E-mail já cadastrado', 'Já existe uma conta com este e-mail.', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Entrar', onPress: () => navigation.replace('Login') },
        ]);
        return;
      }
      Alert.alert(
        'Erro',
        isNetworkError(err)
          ? 'Não foi possível falar com o servidor. Verifique sua conexão e tente novamente.'
          : 'Não foi possível criar a conta. Tente novamente.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!confirmEmail) return;
    setLoading(true);
    try {
      await authService.resendConfirmation(confirmEmail);
      Alert.alert(
        'E-mail reenviado',
        'Se o cadastro ainda estiver pendente, um novo link chega em instantes. Confira também o spam.',
      );
    } catch (err) {
      Alert.alert(
        'Erro',
        isNetworkError(err)
          ? 'Não foi possível falar com o servidor. Verifique sua conexão e tente novamente.'
          : 'Não foi possível reenviar agora. Tente novamente em instantes.',
      );
    } finally {
      setLoading(false);
    }
  }

  /** Mesmo destino do cadastro com sessão: pendingAuth + ProfileSetup. */
  async function handleConfirmedLogin() {
    if (!confirmEmail) return;
    setLoading(true);
    try {
      const res = await authService.login({ email: confirmEmail, password });
      setPendingAuth(res.token, res.user, res.refreshToken);
      navigation.navigate('ProfileSetup');
    } catch (err) {
      const code = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      Alert.alert(
        code === 'EMAIL_NOT_CONFIRMED' ? 'Ainda falta confirmar' : 'Não foi possível entrar',
        loginErrorMessage(err),
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
      setPendingAuth(res.token, res.user, res.refreshToken);
      navigation.navigate('ProfileSetup');
    } catch {
      Alert.alert('Erro', 'Login com Google falhou.');
    } finally {
      setLoading(false);
    }
  }

  async function handleApple() {
    setLoading(true);
    try {
      const { identityToken, fullName, nonce } = await getAppleSignInPayload();
      const res = await authService.loginWithApple(identityToken, fullName, nonce);
      setPendingAuth(res.token, res.user, res.refreshToken);
      navigation.navigate('ProfileSetup');
    } catch {
      Alert.alert('Erro', 'Login com Apple falhou.');
    } finally {
      setLoading(false);
    }
  }

  if (confirmEmail) {
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.container}
        testID="confirm-email-view"
      >
        <View style={styles.header}>
          <Text accessibilityRole="header" variant="heading2" style={styles.title}>
            {confirmTitleLabel}
          </Text>
          <Text variant="body" style={styles.subtitle}>
            Enviamos um link para {confirmEmail}. Abra o e-mail, toque no link e volte para
            entrar. Confira também o spam.
          </Text>
        </View>
        <Button
          onPress={handleConfirmedLogin}
          loading={loading}
          testID="confirmed-login-btn"
          size="lg"
          style={[styles.btn, styles.primaryButton]}
          labelStyle={styles.primaryButtonLabel}
        >
          {confirmedLoginLabel}
        </Button>
        <Button
          variant="secondary"
          onPress={handleResend}
          disabled={loading}
          size="lg"
          style={[styles.btn, styles.secondaryButton]}
          labelStyle={styles.secondaryButtonLabel}
        >
          {resendLabel}
        </Button>
        <Button
          variant="ghost"
          onPress={() => setConfirmEmail(null)}
          size="md"
          style={styles.footerButton}
          labelStyle={styles.footerButtonLabel}
        >
          {otherEmailLabel}
        </Button>
      </ScrollView>
    );
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
        label="Nome completo"
        placeholder="Seu nome completo"
        value={name}
        onChangeText={setName}
        onBlur={() => validateName(name)}
        error={nameError}
        autoCapitalize="words"
      />
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
        placeholder="Mínimo 8 caracteres"
        value={password}
        onChangeText={setPassword}
        onBlur={() => validatePassword(password)}
        error={passwordError}
        secureTextEntry
      />

      <Button
        onPress={handleRegister}
        loading={loading}
        disabled={!isFormValid}
        testID="register-btn"
        size="lg"
        style={[styles.btn, styles.primaryButton]}
        labelStyle={styles.primaryButtonLabel}
      >
        {registerButtonLabel}
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
        onPress={() => navigation.replace('Login')}
        size="md"
        style={styles.footerButton}
        labelStyle={styles.footerButtonLabel}
      >
        {loginFooterLabel}
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
    paddingTop: 46,
    width: '100%',
  },
  header: { alignItems: 'center', marginBottom: 26 },
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
    marginTop: spacing.xxl,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.brandText,
    fontFamily: interfaceFont,
    marginTop: 10,
    maxWidth: 315,
    textAlign: 'center',
  },
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
