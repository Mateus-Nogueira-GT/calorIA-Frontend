import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Input, Text, screenShellStyle } from '@shared/components';
import { adminService, CreditInvite } from '@shared/services/admin.service';
import { profileService } from '@shared/services/profile.service';
import { formatCredits, newOperationKey } from '@shared/services/credits.service';
import { useAuthStore } from '@features/auth/store';
import { colors, radius, spacing } from '@theme';
import { OverviewTab } from '../components/OverviewTab';
import { UsersTab } from '../components/UsersTab';
import { formatDate } from '../format';

const buttonLabels = {
  moreInvites: 'Ver mais convites',
  revokeInvite: 'Revogar convite',
  reload: 'Recarregar',
  createInvite: 'Gerar convite',
  sameLabel: 'Gerar outro com a mesma identificação',
} as const;

export type AdminTab = 'overview' | 'users' | 'invites';
const TABS: { value: AdminTab; label: string }[] = [
  { value: 'overview', label: 'Visão geral' },
  { value: 'users', label: 'Usuários' },
  { value: 'invites', label: 'Convites' },
];
/** Na web/tablet a área usa mais largura que o miolo padrão das telas. */
const WIDE_LAYOUT_MIN = 900;
const WIDE_MAX_WIDTH = 1200;

const labels = { active: 'Ativo', used: 'Resgatado', revoked: 'Revogado', expired: 'Expirado' };
export function AdminScreen({
  initialTab = 'overview',
}: {
  initialTab?: AdminTab;
} = {}): React.JSX.Element {
  const [tab, setTab] = useState<AdminTab>(initialTab);
  const { width } = useWindowDimensions();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  // Falha dos convites não esconde as métricas (spec 21/10): erro só da aba.
  const [inviteError, setInviteError] = useState<string | null>(null);
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
    setInviteError(null);
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
      setError(null);
      if (!profile.is_admin) {
        setItems([]);
        setUrl(null);
        return;
      }
    } catch {
      if (!isCurrent()) return;
      setAllowed(false);
      setItems([]);
      setCursor(null);
      setUrl(null);
      setError('Não foi possível confirmar o acesso de administrador.');
      return;
    }
    try {
      const page = await adminService.invites(next);
      if (!isCurrent()) return;
      setItems((old) => (next ? [...old, ...page.items] : page.items));
      setCursor(page.next_cursor ?? null);
      setInviteError(null);
    } catch (e) {
      if (!isCurrent()) return;
      const status = (e as { response?: { status?: number } }).response?.status;
      setItems([]);
      setCursor(null);
      setInviteError(
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
  async function create(labelOverride?: string) {
    if (lock.current || allowed !== true || inviteError) return;
    if (labelOverride !== undefined) {
      // Outro convite com a mesma identificação: nova solicitação, nova chave.
      createKey.current = null;
      setLabel(labelOverride);
    }
    const inviteLabel = labelOverride ?? label;
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
      const invite = await adminService.createInvite(inviteLabel, createKey.current);
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
  const wide = width >= WIDE_LAYOUT_MIN;
  const invitesTab = (
    <>
      {inviteError && (
        <>
          <Text accessibilityRole="alert">{inviteError}</Text>
          <Button variant="secondary" onPress={() => load()}>
            {buttonLabels.reload}
          </Button>
        </>
      )}
      {!inviteError && (
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
          <Button loading={busy} onPress={() => create()}>
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
          {items.length === 0 && <Text>Nenhum convite gerado.</Text>}
          {items.map((item) => (
            <View key={item.id} style={styles.item}>
              <Text>
                {item.label || 'Convite sem identificação'} · {labels[item.status]}
              </Text>
              <Text variant="caption">
                Criado em {formatDate(item.created_at)} · Validade: {formatDate(item.expires_at)}
              </Text>
              {item.status === 'used' && (
                <>
                  <Text variant="caption">
                    {item.claimed_by
                      ? `Resgatado por ${item.claimed_by_name || 'Sem nome'}${
                          item.claimed_by_email ? ` (${item.claimed_by_email})` : ''
                        } em ${formatDate(item.claimed_at)}`
                      : 'Resgatado por uma conta excluída'}
                  </Text>
                  {item.usage_since_claim && item.claimed_by && (
                    <Text variant="caption">
                      Depois do resgate: {formatCredits(item.usage_since_claim.debited_units)}{' '}
                      créditos usados · {item.usage_since_claim.photos} fotos ·{' '}
                      {item.usage_since_claim.messages} mensagens
                    </Text>
                  )}
                </>
              )}
              {item.status === 'active' && (
                <Button disabled={busy} variant="secondary" onPress={() => revoke(item.id)}>
                  {buttonLabels.revokeInvite}
                </Button>
              )}
              {item.label && (
                <Button
                  disabled={busy}
                  variant="secondary"
                  onPress={() => create(item.label ?? '')}
                >
                  {buttonLabels.sameLabel}
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
    </>
  );
  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          wide && styles.contentWide,
          { paddingBottom: insets.bottom + spacing.xxl },
        ]}
      >
        <Text variant="heading2">Administração</Text>
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
            <View style={styles.tabs} accessibilityRole="tablist">
              {TABS.map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === option.value }}
                  onPress={() => setTab(option.value)}
                  style={[styles.tab, tab === option.value && styles.tabSelected]}
                >
                  <Text style={tab === option.value ? styles.tabTextSelected : undefined}>
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {tab === 'overview' && <OverviewTab />}
            {tab === 'users' && <UsersTab />}
            {tab === 'invites' && invitesTab}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.brandBackground },
  content: { ...screenShellStyle, padding: spacing.lg, gap: spacing.lg },
  contentWide: { maxWidth: WIDE_MAX_WIDTH },
  link: { gap: spacing.md },
  url: { flexShrink: 1 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tab: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandDivider,
  },
  tabSelected: { backgroundColor: colors.brandAnchor, borderColor: colors.brandAnchor },
  tabTextSelected: { color: colors.brandBackground },
  item: {
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.brandDivider,
    gap: spacing.sm,
  },
});
