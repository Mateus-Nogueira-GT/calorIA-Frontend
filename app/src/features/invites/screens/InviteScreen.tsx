import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Text, screenShellStyle } from '@shared/components';
import api from '@shared/services/api';
import { useAuthStore } from '@features/auth/store';
import { useCreditsStore } from '@features/credits/store';
import { formatCredits } from '@shared/services/credits.service';
import { colors, spacing } from '@theme';

const buttonLabels = {
  openApp: 'Abrir no aplicativo',
  switchAccount: 'Usar outra conta',
  checkInvite: 'Conferir convite',
  continue: 'Continuar',
  claim: 'Confirmar e receber créditos',
  signIn: 'Entrar ou criar conta',
  skip: 'Continuar sem resgatar',
} as const;

interface Props {
  token: string;
  onAuthenticate: () => void;
  onDone: () => void;
}
export function InviteScreen({ token, onAuthenticate, onDone }: Props): React.JSX.Element {
  const user = useAuthStore((s) => s.user);
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  const [preview, setPreview] = useState<{ grant_units: number; expires_at: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<'new' | 'existing' | null>(null);
  const generation = useAuthStore((state) => state.sessionGeneration);
  const scope = `${generation}:${token}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const mounted = useRef(false);
  const previewVersion = useRef(0);
  const claimVersion = useRef(0);
  const lock = useRef(false);
  const load = useCallback(async () => {
    const version = ++previewVersion.current;
    const isCurrent = () =>
      mounted.current && currentScope.current === scope && version === previewVersion.current;
    setError(null);
    setPreview(null);
    try {
      const response = await api.post<{ grant_units: number; expires_at: string }>(
        '/credit-invites/preview',
        { token },
      );
      if (isCurrent()) setPreview(response.data);
    } catch {
      if (isCurrent())
        setError(
          'Este convite está indisponível, expirou ou foi revogado. Confira o link com quem o enviou.',
        );
    }
  }, [scope, token]);
  useEffect(() => {
    mounted.current = true;
    claimVersion.current++;
    lock.current = false;
    setDone(null);
    setBusy(false);
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);
  async function claim() {
    if (lock.current || !authenticated || !preview) return;
    const version = ++claimVersion.current;
    const isCurrent = () =>
      mounted.current && currentScope.current === scope && version === claimVersion.current;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await api.post<{ granted: boolean }>('/credit-invites/redeem', { token });
      if (!isCurrent()) return;
      setDone(response.data.granted ? 'new' : 'existing');
      await useCreditsStore.getState().load();
    } catch (e) {
      if (!isCurrent()) return;
      const code = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(
        code === 'WELCOME_ALREADY_CLAIMED' || code === 'WELCOME_ALREADY_GRANTED'
          ? 'Esta conta já recebeu o benefício de boas-vindas. O convite continua disponível para outra conta elegível.'
          : 'Não foi possível resgatar. Tente novamente para confirmar o resultado; o benefício não será duplicado.',
      );
    } finally {
      if (isCurrent()) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="heading1">Seu convite para o calorIA</Text>
        {error && (
          <>
            <Text accessibilityRole="alert">{error}</Text>
            <Button variant="secondary" onPress={load}>
              {buttonLabels.checkInvite}
            </Button>
          </>
        )}
        {!preview && !error && <Text>Conferindo convite…</Text>}
        {done ? (
          <>
            <Text>
              {done === 'existing'
                ? 'Estes créditos de boas-vindas já foram confirmados na sua conta.'
                : 'Créditos de boas-vindas confirmados na sua conta.'}
            </Text>
            <Text>
              Se estiver no navegador, depois instale o aplicativo e entre nesta mesma conta. Seu
              saldo acompanha você.
            </Text>
            <Button onPress={onDone}>{buttonLabels.continue}</Button>
          </>
        ) : (
          preview && (
            <>
              <Text>
                {formatCredits(preview.grant_units)} créditos de boas-vindas para experimentar o
                aplicativo.
              </Text>
              <Text>
                Benefício uma vez por conta. Válido até{' '}
                {new Date(preview.expires_at).toLocaleDateString('pt-BR')}.
              </Text>
              {authenticated ? (
                <View style={styles.group}>
                  <Text>Resgatar para {user?.email}? Confirme a conta antes de continuar.</Text>
                  <Button loading={busy} onPress={claim}>
                    {buttonLabels.claim}
                  </Button>
                  <Button
                    disabled={busy}
                    variant="secondary"
                    onPress={() => {
                      useAuthStore.getState().clearToken();
                      onAuthenticate();
                    }}
                  >
                    {buttonLabels.switchAccount}
                  </Button>
                </View>
              ) : (
                <>
                  <Text>Entre ou crie sua conta. Você voltará aqui para confirmar o resgate.</Text>
                  <Button onPress={onAuthenticate}>{buttonLabels.signIn}</Button>
                </>
              )}
              {Platform.OS === 'web' && (
                <>
                  <Button
                    variant="secondary"
                    onPress={() => {
                      void Linking.openURL(`caloria://invite/${token}`).catch(() =>
                        setError(
                          'Abra este mesmo convite depois de instalar o aplicativo, ou conclua o resgate pelo navegador.',
                        ),
                      );
                    }}
                  >
                    {buttonLabels.openApp}
                  </Button>
                  <Text>
                    Se o aplicativo ainda não estiver instalado, conclua o resgate aqui e depois
                    entre na mesma conta. A instalação não transfere o link automaticamente.
                  </Text>
                </>
              )}
            </>
          )
        )}
        {!busy && !done && (
          <Button variant="ghost" onPress={onDone}>
            {buttonLabels.skip}
          </Button>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.brandBackground },
  content: {
    ...screenShellStyle,
    padding: spacing.xl,
    gap: spacing.lg,
    flexGrow: 1,
    justifyContent: 'center',
  },
  group: { gap: spacing.md },
});
