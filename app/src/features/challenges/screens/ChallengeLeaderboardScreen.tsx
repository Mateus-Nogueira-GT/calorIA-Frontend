import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing } from '@theme';
import { useChallengesStore } from '../store';
import { LeaderboardRow } from '../components/LeaderboardRow';
import { InviteButton } from '../components/InviteButton';
import { ErrorState } from '@shared/components';
import type { Challenge } from '@shared/services/challenges.service';
import type { CommunityStackScreenProps } from '@navigation/types';

type Props = CommunityStackScreenProps<'ChallengeLeaderboard'>;

export function ChallengeLeaderboardScreen({ route }: Props): React.JSX.Element {
  // Sem o fallback, navegação sem params ou deep link malformado dava
  // TypeError na desestruturação e derrubava a tela.
  const { challengeId, code } = route.params ?? {};
  const challenges = useChallengesStore((s) => s.challenges);
  const leaderboardByChallenge = useChallengesStore((s) => s.leaderboardByChallenge);
  const loadingId = useChallengesStore((s) => s.loadingLeaderboardId);
  const loadLeaderboard = useChallengesStore((s) => s.loadLeaderboard);
  const resolveInvite = useChallengesStore((s) => s.resolveInvite);

  const [resolvedId, setResolvedId] = useState<string | undefined>(challengeId);
  const [hasError, setHasError] = useState(false);

  async function init() {
    let id = challengeId;
    try {
      if (!id && code) {
        const challenge: Challenge = await resolveInvite(code);
        id = challenge.id;
      }
      if (id) {
        setResolvedId(id);
        await loadLeaderboard(id);
      }
    } catch {
      setHasError(true);
    }
  }

  useEffect(() => {
    let active = true;
    if (!active) return;
    void init();
    return () => {
      active = false;
    };
  }, [challengeId, code, loadLeaderboard, resolveInvite]);

  const challenge = challenges.find((c) => c.id === resolvedId);
  const entries = resolvedId ? leaderboardByChallenge[resolvedId] ?? [] : [];
  const isLoading = loadingId === resolvedId && entries.length === 0;

  const reload = () => {
    setHasError(false);
    void init();
  };

  if (!challengeId && !code) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ErrorState
          title="Desafio não encontrado"
          subtitle="Abra o desafio pela lista ou por um convite válido."
          onRetry={reload}
        />
      </SafeAreaView>
    );
  }

  if (hasError) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ErrorState onRetry={reload} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={entries}
        keyExtractor={(e) => `${e.rank}-${e.user.id}`}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>{challenge?.title ?? 'Ranking'}</Text>
            {challenge ? <Text style={styles.subtitle}>{challenge.participantCount} participantes · por sequência</Text> : null}
            {challenge ? (
              <View style={styles.invite}>
                <InviteButton inviteCode={challenge.inviteCode} title={challenge.title} />
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => <LeaderboardRow entry={item} />}
        ListEmptyComponent={isLoading ? null : <Text style={styles.empty}>Ranking ainda vazio.</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brandBackground },
  list: { padding: spacing.lg, flexGrow: 1 },
  header: { marginBottom: spacing.md, gap: spacing.xs },
  title: { fontSize: 22, color: colors.brandAnchor, fontFamily: typography.fontFamily.bold },
  subtitle: { fontSize: typography.fontSize.sm, color: colors.brandTextMuted },
  invite: { marginTop: spacing.md },
  empty: { textAlign: 'center', color: colors.brandTextMuted, marginTop: spacing.xxxl, fontSize: typography.fontSize.base },
});
