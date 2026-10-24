import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, ErrorState, Input, Text } from '@shared/components';
import {
  adminService,
  AdminPeriod,
  AdminUserRow,
  AdminUserSort,
} from '@shared/services/admin.service';
import { formatCredits } from '@shared/services/credits.service';
import { colors, radius, spacing } from '@theme';
import { formatDate, formatInt } from '../format';
import { UserCreditsSheet } from './UserCreditsSheet';
import { PeriodSelector } from './OverviewTab';

export const SEARCH_DEBOUNCE_MS = 300;
const MORE_USERS_LABEL = 'Ver mais usuários';
const SORTS: { value: AdminUserSort; label: string }[] = [
  { value: 'recent', label: 'Mais recentes' },
  { value: 'active', label: 'Mais ativos' },
  { value: 'low_balance', label: 'Menor saldo' },
  { value: 'ai_usage', label: 'Mais uso de IA' },
];

function UserRow({
  user,
  days,
  onPress,
}: {
  user: AdminUserRow;
  days: AdminPeriod;
  onPress: () => void;
}): React.JSX.Element {
  const tags = [
    user.has_active_diet ? 'Dieta ativa' : null,
    user.joined_by_invite ? 'Entrou por convite' : null,
    user.current_streak > 0 ? `${user.current_streak} dias seguidos` : null,
  ].filter(Boolean);
  return (
    <Pressable
      style={styles.row}
      accessible
      accessibilityRole="button"
      accessibilityHint="Abre a liberação de créditos"
      onPress={onPress}
    >
      <View style={styles.nameLine}>
        <Text variant="label">{user.name || 'Sem nome'}</Text>
        {user.unlimited && (
          <View style={styles.badge}>
            <Text variant="caption" style={styles.badgeText}>
              Ilimitado
            </Text>
          </View>
        )}
      </View>
      <Text variant="caption" selectable>
        {user.email ?? 'sem e-mail'}
      </Text>
      <Text variant="caption">
        Cadastro {formatDate(user.created_at)} · Última atividade{' '}
        {formatDate(user.last_activity_at)}
      </Text>
      <Text variant="caption">
        Saldo {formatCredits(user.balance_units)} créditos · {formatInt(user.photos)} fotos ·{' '}
        {formatInt(user.messages)} mensagens em {days} dias
      </Text>
      {tags.length > 0 && <Text variant="caption">{tags.join(' · ')}</Text>}
    </Pressable>
  );
}

export function UsersTab(): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<string | undefined>(undefined);
  const [sort, setSort] = useState<AdminUserSort>('recent');
  const [days, setDays] = useState<AdminPeriod>(30);
  const [items, setItems] = useState<AdminUserRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const version = useRef(0);

  // Busca só com 2+ caracteres, depois de uma pausa na digitação.
  useEffect(() => {
    const trimmed = query.trim();
    const timer = setTimeout(
      () => setSearch(trimmed.length >= 2 ? trimmed : undefined),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(
    async (next?: string) => {
      const current = ++version.current;
      setLoading(true);
      setError(false);
      try {
        const page = await adminService.users({ q: search, sort, cursor: next, days });
        if (current !== version.current) return;
        setItems((old) => (next ? [...old, ...page.items] : page.items));
        setCursor(page.next_cursor);
      } catch {
        if (current === version.current) setError(true);
      } finally {
        if (current === version.current) setLoading(false);
      }
    },
    [search, sort, days],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.container}>
      <Input
        label="Buscar por nome ou e-mail"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={styles.sorts} accessibilityRole="radiogroup">
        {SORTS.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: sort === option.value }}
            onPress={() => setSort(option.value)}
            style={[styles.sort, sort === option.value && styles.sortSelected]}
          >
            <Text style={sort === option.value ? styles.sortTextSelected : undefined}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <PeriodSelector value={days} onChange={setDays} />
      {error && (
        <ErrorState title="Não foi possível carregar os usuários" onRetry={() => void load()} />
      )}
      {!error && items.length === 0 && !loading && <Text>Nenhum usuário encontrado.</Text>}
      {items.map((user) => (
        <UserRow key={user.id} user={user} days={days} onPress={() => setSelected(user)} />
      ))}
      {selected && (
        <UserCreditsSheet
          user={selected}
          onClose={() => setSelected(null)}
          onUpdated={(patch) => {
            // Reflete o novo saldo na linha sem perder as páginas já carregadas.
            setItems((old) => old.map((u) => (u.id === selected.id ? { ...u, ...patch } : u)));
            setSelected((old) => (old ? { ...old, ...patch } : old));
          }}
        />
      )}
      {loading && <Text>Carregando…</Text>}
      {cursor && !loading && (
        <Button variant="secondary" onPress={() => void load(cursor)}>
          {MORE_USERS_LABEL}
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  sorts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sort: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.brandDivider,
  },
  sortSelected: { backgroundColor: colors.brandAnchor, borderColor: colors.brandAnchor },
  sortTextSelected: { color: colors.brandBackground },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.brandAnchor,
  },
  badgeText: { color: colors.brandBackground },
  row: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.brandDivider,
    gap: spacing.xs,
  },
});
