import React, { useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { authService } from '@shared/services/auth.service';
import { Button, Input, Text, screenShellStyle } from '@shared/components';
import { colors, spacing } from '@theme';
import type { AuthStackScreenProps } from '@navigation/types';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const titleLabel = 'Recuperar senha';
const subtitleLabel = 'Informe seu email e enviaremos um link para redefinir a senha.';
const submitLabel = 'Enviar link';
const backToLoginLabel = 'Voltar para o login';
const successTitleLabel = 'Verifique seu email';
const successBodyLabel =
  'Se existir uma conta com esse email, você receberá um link para criar uma nova senha.';

export function ForgotPasswordScreen({
  navigation,
}: AuthStackScreenProps<'ForgotPassword'>): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    if (!isValidEmail(email)) {
      setEmailError('E-mail inválido');
      return;
    }
    setLoading(true);
    try {
      await authService.forgotPassword(email.trim());
      setSent(true);
    } catch {
      // O backend responde 200 mesmo sem conta; erro aqui é rede/servidor.
      setEmailError('Não foi possível enviar agora. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <View style={styles.centered}>
        <Text variant="heading2" style={styles.title}>
          {successTitleLabel}
        </Text>
        <Text variant="body" style={styles.subtitle}>
          {successBodyLabel}
        </Text>
        <Button onPress={() => navigation.navigate('Login')} style={styles.submitBtn}>
          {backToLoginLabel}
        </Button>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text variant="heading2" style={styles.title}>
        {titleLabel}
      </Text>
      <Text variant="body" style={styles.subtitle}>
        {subtitleLabel}
      </Text>

      <Input
        label="Email"
        placeholder="voce@exemplo.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          if (emailError) setEmailError('');
        }}
        error={emailError}
        testID="forgot-email-input"
      />

      <Button
        onPress={handleSubmit}
        loading={loading}
        disabled={!isValidEmail(email)}
        style={styles.submitBtn}
        testID="forgot-submit"
      >
        {submitLabel}
      </Button>

      <TouchableOpacity accessibilityRole="button" onPress={() => navigation.goBack()}>
        <Text variant="caption" style={styles.footerLink}>
          {backToLoginLabel}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: spacing.xxl },
  centered: {
    ...screenShellStyle,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  title: { marginBottom: spacing.sm },
  subtitle: { color: colors.textSecondary, marginBottom: spacing.xl },
  submitBtn: { marginTop: spacing.md },
  footerLink: { color: colors.primary, textAlign: 'center', marginTop: spacing.lg },
});
