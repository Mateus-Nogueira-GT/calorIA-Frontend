import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Input, Text, screenShellStyle } from '@shared/components';
import { adminService, CreditInvite } from '@shared/services/admin.service';
import { profileService } from '@shared/services/profile.service';
import { newOperationKey } from '@shared/services/credits.service';
import { useAuthStore } from '@features/auth/store';
import { colors, spacing } from '@theme';

const buttonLabels = {
  moreInvites: 'Ver mais convites',
  revokeInvite: 'Revogar convite',
  reload: 'Recarregar',
  createInvite: 'Gerar convite',
} as const;

const labels = { active: 'Ativo', used: 'Resgatado', revoked: 'Revogado', expired: 'Expirado' };
export function AdminScreen(): React.JSX.Element {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [items, setItems] = useState<CreditInvite[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const createKey = useRef<string | null>(null);
  const insets = useSafeAreaInsets();
  const generation = useAuthStore((state) => state.sessionGeneration);
  const active = useRef(false);
  const loadVersion = useRef(0);
  const focusVersion = useRef(0);
  useEffect(() => {
    setAllowed(null);
    setItems([]);
    setCursor(null);
    setUrl(null);
    setNotice(null);
    setError(null);
    setLabel('');
    createKey.current = null;
    lock.current = false;
    setBusy(false);
  }, [generation]);
  const load = useCallback(async (next?: string) => {
    const requestedGeneration = useAuthStore.getState().sessionGeneration;
    const version = ++loadVersion.current;
    const isCurrent = () =>
      active.current &&
      version === loadVersion.current &&
      requestedGeneration === useAuthStore.getState().sessionGeneration;
    try {
      const profile = await profileService.getMe();
      if (!isCurrent()) return;
      setAllowed(profile.is_admin === true);
      if (!profile.is_admin) {
        setItems([]);
        setUrl(null);
        return;
      }
      const page = await adminService.invites(next);
      if (!isCurrent()) return;
      setItems((old) => (next ? [...old, ...page.items] : page.items));
      setCursor(page.next_cursor ?? null);
      setError(null);
    } catch (e) {
      if (!isCurrent()) return;
      const status = (e as { response?: { status?: number } }).response?.status;
      setAllowed(false);
      setItems([]);
      setCursor(null);
      setError(
        status === 404
          ? 'Convites indisponíveis ou acesso revogado.'
          : 'Não foi possível carregar os convites.',
      );
      setUrl(null);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      if (generation !== useAuthStore.getState().sessionGeneration) return;
      active.current = true;
      void load();
      return () => {
        active.current = false;
        loadVersion.current++;
        focusVersion.current++;
        lock.current = false;
        setBusy(false);
        setUrl(null);
      };
    }, [load, generation]),
  );
  async function create() {
    if (lock.current || allowed !== true) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    setUrl(null);
    setNotice(null);
    const generation = useAuthStore.getState().sessionGeneration;
    const focus = focusVersion.current;
    const isCurrent = () =>
      active.current &&
      focus === focusVersion.current &&
      generation === useAuthStore.getState().sessionGeneration;
    createKey.current ??= newOperationKey();
    try {
      const invite = await adminService.createInvite(label, createKey.current);
      if (!isCurrent()) return;
      setUrl(invite.url);
      setNotice(
        invite.url
          ? 'Link gerado. Guarde ou compartilhe agora; ele será mostrado uma única vez.'
          : 'Este convite já foi emitido. Se perdeu o link, revogue-o na lista e gere outro.',
      );
      createKey.current = null;
      setLabel('');
      await load();
    } catch {
      if (isCurrent())
        setError(
          'Não foi possível confirmar a emissão. Tente novamente: a mesma solicitação não cria dois convites.',
        );
    } finally {
      if (isCurrent()) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  async function revoke(id: string) {
    if (lock.current || allowed !== true) return;
    lock.current = true;
    setBusy(true);
    const generation = useAuthStore.getState().sessionGeneration;
    const focus = focusVersion.current;
    const isCurrent = () =>
      active.current &&
      focus === focusVersion.current &&
      generation === useAuthStore.getState().sessionGeneration;
    try {
      await adminService.revokeInvite(id);
      if (isCurrent()) {
        setUrl(null);
        await load();
      }
    } catch {
      if (isCurrent()) setError('Não foi possível revogar. Recarregue para conferir o estado.');
    } finally {
      if (isCurrent()) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  async function share() {
    if (!url) return;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setNotice('Link copiado.');
      } else {
        await Share.share({ message: `Seu convite para o calorIA com 15 créditos: ${url}` });
      }
    } catch {
      setNotice('Selecione o link abaixo para copiá-lo manualmente.');
    }
  }
  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
      >
        <Text variant="heading2">Convites e créditos</Text>
        {allowed === null && !error && <Text>Verificando acesso…</Text>}
        {allowed === false && <Text>Esta área está disponível somente para administradores.</Text>}
        {error && (
          <>
            <Text accessibilityRole="alert">{error}</Text>
            <Button variant="secondary" onPress={() => load()}>
              {buttonLabels.reload}
            </Button>
          </>
        )}
        {allowed && (
          <>
            <Text>
              Cada link dá 15 créditos de boas-vindas a uma conta. Uso único e validade de 7 dias. O
              benefício é concedido uma vez por conta.
            </Text>
            <Input
              label="Identificação interna (opcional)"
              value={label}
              onChangeText={setLabel}
              maxLength={100}
              editable={!busy && !createKey.current}
            />
            <Button loading={busy} onPress={create}>
              {buttonLabels.createInvite}
            </Button>
            {notice && <Text accessibilityLiveRegion="polite">{notice}</Text>}
            {url && (
              <View style={styles.link}>
                <Text selectable style={styles.url}>
                  {url}
                </Text>
                <Button variant="secondary" onPress={share}>
                  {Platform.OS === 'web' ? 'Copiar link' : 'Compartilhar link'}
                </Button>
              </View>
            )}
            <Text variant="heading3">Convites gerados</Text>
            {items.length === 0 && !error && <Text>Nenhum convite gerado.</Text>}
            {items.map((item) => (
              <View key={item.id} style={styles.item}>
                <Text>
                  {item.label || 'Convite sem identificação'} · {labels[item.status]}
                </Text>
                <Text variant="caption">
                  Criado em {new Date(item.created_at).toLocaleDateString('pt-BR')} · Validade:{' '}
                  {new Date(item.expires_at).toLocaleDateString('pt-BR')}
                </Text>
                {item.status === 'active' && (
                  <Button disabled={busy} variant="secondary" onPress={() => revoke(item.id)}>
                    {buttonLabels.revokeInvite}
                  </Button>
                )}
              </View>
            ))}
            {cursor && (
              <Button disabled={busy} variant="secondary" onPress={() => load(cursor)}>
                {buttonLabels.moreInvites}
              </Button>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.brandBackground },
  content: { ...screenShellStyle, padding: spacing.lg, gap: spacing.lg },
  link: { gap: spacing.md },
  url: { flexShrink: 1 },
  item: {
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.brandDivider,
    gap: spacing.sm,
  },
});
