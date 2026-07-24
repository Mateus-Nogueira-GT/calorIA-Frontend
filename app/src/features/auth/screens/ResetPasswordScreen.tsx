import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { authService } from '@shared/services/auth.service';
import { Button, Input, Text } from '@shared/components';
import { colors, spacing } from '@theme';
import type { AuthStackScreenProps } from '@navigation/types';

/**
 * Lê o access_token de recovery que o Supabase põe no FRAGMENT da URL
 * (ex.: /reset-password#access_token=...&type=recovery). Web apenas.
 */
export function readRecoveryTokenFromUrl(): string | null {
  if (typeof window === 'undefined' || typeof window.location?.hash !== 'string') return null;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  if (params.get('type') !== 'recovery') return null;
  return params.get('access_token');
}

const titleLabel = 'Criar nova senha';
const subtitleLabel = 'Defina a nova senha da sua conta.';
const submitLabel = 'Salvar nova senha';
const goToLoginLabel = 'Ir para o login';
const successTitleLabel = 'Senha alterada!';
const successBodyLabel = 'Sua senha foi redefinida. Entre com a nova senha.';
const invalidLinkTitleLabel = 'Link inválido ou expirado';
const invalidLinkBodyLabel = 'Solicite um novo link de recuperação na tela de login.';

export function ResetPasswordScreen({
  navigation,
}: AuthStackScreenProps<'ResetPassword'>): React.JSX.Element {
  const token = useMemo(readRecoveryTokenFromUrl, []);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const passwordError = password.length > 0 && password.length < 8 ? 'Mínimo de 8 caracteres' : '';
  const confirmError = confirm.length > 0 && confirm !== password ? 'As senhas não conferem' : '';
  const isFormValid = password.length >= 8 && confirm === password;

  async function handleSubmit() {
    if (!token || !isFormValid) return;
    setLoading(true);
    setError('');
    try {
      await authService.resetPassword(token, password);
      setDone(true);
    } catch {
      setError('Link inválido ou expirado. Solicite um novo na tela de login.');
    } finally {
      setLoading(false);
    }
  }

  if (!token || done) {
    return (
      <View style={styles.centered}>
        <Text variant="heading2" style={styles.title}>
          {done ? successTitleLabel : invalidLinkTitleLabel}
        </Text>
        <Text variant="body" style={styles.subtitle}>
          {done ? successBodyLabel : invalidLinkBodyLabel}
        </Text>
        <Button onPress={() => navigation.navigate('Login')} style={styles.submitBtn}>
          {goToLoginLabel}
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
        label="Nova senha"
        placeholder="Mínimo 8 caracteres"
        secureTextEntry
        autoCapitalize="none"
        value={password}
        onChangeText={setPassword}
        error={passwordError}
        testID="reset-password-input"
      />
      <Input
        label="Confirmar senha"
        placeholder="Repita a senha"
        secureTextEntry
        autoCapitalize="none"
        value={confirm}
        onChangeText={setConfirm}
        error={confirmError || error}
        testID="reset-confirm-input"
      />

      <Button
        onPress={handleSubmit}
        loading={loading}
        disabled={!isFormValid}
        style={styles.submitBtn}
        testID="reset-submit"
      >
        {submitLabel}
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: spacing.xxl },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  title: { marginBottom: spacing.sm },
  subtitle: { color: colors.textSecondary, marginBottom: spacing.xl },
  submitBtn: { marginTop: spacing.md },
});
