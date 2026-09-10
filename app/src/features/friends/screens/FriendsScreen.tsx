import React, { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { screenShellStyle } from '@shared/components';
import { Avatar, EmptyState, ErrorState, Text } from '@shared/components';
import { colors, radius, spacing, typography } from '@theme';
import type { Friend, FriendRequest, UserSearchResult } from '@shared/services/friends.service';
import type { CommunityStackScreenProps } from '@navigation/types';
import { useFriendsStore } from '../store';

export type FriendsTabKey = 'friends' | 'requests' | 'search';
type TabKey = FriendsTabKey;

const TABS: { key: TabKey; label: string }[] = [
  { key: 'friends', label: 'Amigos' },
  { key: 'requests', label: 'Pedidos' },
  { key: 'search', label: 'Buscar' },
];

function displayName(user: { name: string | null; username: string | null }): string {
  return user.name ?? user.username ?? 'Usuário';
}

function RowShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <View style={styles.row}>{children}</View>;
}

export function FriendsScreen({ route }: CommunityStackScreenProps<'Friends'>): React.JSX.Element {
  const store = useFriendsStore();
  // A notificação de pedido de amizade abre direto na aba Pedidos.
  const [tab, setTab] = useState<TabKey>(route.params?.initialTab ?? 'friends');
  const [query, setQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void store.load();
    // Cancela o debounce pendente ao sair da tela (buscava depois de desmontar).
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onChangeQuery(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void store.search(value), 400);
  }

  async function handleAdd(user: UserSearchResult) {
    if (!user.username) {
      Alert.alert('Não foi possível enviar', 'Este usuário ainda não tem um nome de usuário.');
      return;
    }
    const ok = await store.sendRequest(user.username);
    if (!ok) Alert.alert('Não foi possível enviar o pedido', 'Tente novamente.');
  }

  function confirmRemove(friend: Friend) {
    Alert.alert('Remover amizade', `Deixar de ser amigo de ${displayName(friend)}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: () => void store.removeFriend(friend.friendshipId),
      },
    ]);
  }

  function renderFriend({ item }: { item: Friend }) {
    return (
      <RowShell>
        <Avatar uri={item.avatarUrl ?? undefined} emoji="🙂" size="md" />
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>{displayName(item)}</Text>
          {item.username ? <Text style={styles.rowSubtitle}>@{item.username}</Text> : null}
        </View>
        {item.currentStreak != null && item.currentStreak > 0 ? (
          <Text style={styles.streak}>🔥 {item.currentStreak}</Text>
        ) : null}
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => confirmRemove(item)}
          style={styles.secondaryBtn}
        >
          <Text style={styles.secondaryBtnText}>Remover</Text>
        </TouchableOpacity>
      </RowShell>
    );
  }

  function renderRequest({ item }: { item: FriendRequest }) {
    return (
      <RowShell>
        <Avatar uri={item.user.avatarUrl ?? undefined} emoji="🙂" size="md" />
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>{displayName(item.user)}</Text>
          {item.user.username ? (
            <Text style={styles.rowSubtitle}>@{item.user.username}</Text>
          ) : null}
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => void store.respond(item.id, 'accept')}
          style={styles.primaryBtn}
          testID={`accept-${item.id}`}
        >
          <Text style={styles.primaryBtnText}>Aceitar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => void store.respond(item.id, 'reject')}
          style={styles.secondaryBtn}
        >
          <Text style={styles.secondaryBtnText}>Recusar</Text>
        </TouchableOpacity>
      </RowShell>
    );
  }

  function renderSearchResult({ item }: { item: UserSearchResult }) {
    return (
      <RowShell>
        <Avatar uri={item.avatarUrl ?? undefined} emoji="🙂" size="md" />
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>{displayName(item)}</Text>
          {item.username ? <Text style={styles.rowSubtitle}>@{item.username}</Text> : null}
        </View>
        {item.relationship === 'none' ? (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => void handleAdd(item)}
            style={styles.primaryBtn}
            testID={`add-${item.id}`}
          >
            <Text style={styles.primaryBtnText}>Adicionar</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.relationshipLabel}>
            {item.relationship === 'friends'
              ? 'Amigos'
              : item.relationship === 'pending_sent'
                ? 'Pedido enviado'
                : 'Aguardando você'}
          </Text>
        )}
      </RowShell>
    );
  }

  const incomingCount = store.incoming.length;

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            accessibilityRole="button"
            accessibilityState={{ selected: tab === t.key }}
            onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && styles.tabSelected]}
            testID={`friends-tab-${t.key}`}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextSelected]}>
              {t.label}
              {t.key === 'requests' && incomingCount > 0 ? ` (${incomingCount})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'search' ? (
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por nome ou @usuario"
          placeholderTextColor={colors.textDisabled}
          autoCapitalize="none"
          value={query}
          onChangeText={onChangeQuery}
          testID="friends-search-input"
        />
      ) : null}

      {store.error && tab !== 'search' ? (
        <ErrorState
          title={store.error}
          subtitle="Tente novamente."
          onRetry={() => void store.load()}
        />
      ) : tab === 'friends' ? (
        <FlatList
          data={store.friends}
          keyExtractor={(f) => f.friendshipId}
          renderItem={renderFriend}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            store.isLoading ? null : (
              <EmptyState
                emoji="👥"
                title="Nenhum amigo ainda"
                subtitle="Use a aba Buscar para encontrar pessoas."
                actionLabel="Buscar amigos"
                onAction={() => setTab('search')}
              />
            )
          }
        />
      ) : tab === 'requests' ? (
        <FlatList
          data={store.incoming}
          keyExtractor={(r) => r.id}
          renderItem={renderRequest}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            store.outgoing.length > 0 ? (
              <Text style={styles.sectionHint}>
                {store.outgoing.length}{' '}
                {store.outgoing.length === 1
                  ? 'pedido enviado aguardando'
                  : 'pedidos enviados aguardando'}{' '}
                resposta
              </Text>
            ) : null
          }
          ListEmptyComponent={
            store.isLoading ? null : (
              <EmptyState
                emoji="📬"
                title="Nenhum pedido pendente"
                subtitle="Quando alguém te adicionar, o pedido aparece aqui."
              />
            )
          }
        />
      ) : (
        <FlatList
          data={store.searchResults}
          keyExtractor={(u) => u.id}
          renderItem={renderSearchResult}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            store.isSearching ? null : query.trim().length >= 2 ? (
              <EmptyState
                emoji="🔍"
                title="Ninguém encontrado"
                subtitle="Confira o nome ou tente outro termo."
              />
            ) : (
              <EmptyState
                emoji="🔍"
                title="Encontre seus amigos"
                subtitle="Digite ao menos 2 letras do nome ou usuário."
              />
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.brandBackground, paddingTop: spacing.md },
  tabs: {
    ...screenShellStyle,
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.brandSurface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  tabSelected: { backgroundColor: colors.brandPrimary },
  tabText: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.brandAnchor,
  },
  tabTextSelected: { fontFamily: typography.fontFamily.semiBold },
  searchInput: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.regular,
    color: colors.brandAnchor,
    backgroundColor: colors.brandSurface,
  },
  listContent: { ...screenShellStyle, paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.brandDivider,
  },
  rowBody: { flex: 1 },
  rowTitle: {
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.brandAnchor,
  },
  rowSubtitle: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.textSecondary,
  },
  streak: { fontSize: typography.fontSize.sm, fontFamily: typography.fontFamily.semiBold },
  primaryBtn: {
    backgroundColor: colors.brandPrimary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  primaryBtnText: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.brandAnchor,
  },
  secondaryBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandDivider,
  },
  secondaryBtnText: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.textSecondary,
  },
  sectionHint: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  relationshipLabel: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.textSecondary,
  },
});
