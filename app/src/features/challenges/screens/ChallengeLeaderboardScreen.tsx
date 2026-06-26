import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography } from '@theme';
import { useChallengesStore } from '../store';
import { LeaderboardRow } from '../components/LeaderboardRow';
import { InviteButton } from '../components/InviteButton';
import type { Challenge } from '@shared/services/challenges.service';
import type { CommunityStackScreenProps } from '@navigation/types';

type Props = CommunityStackScreenProps<'ChallengeLeaderboard'>;

export function ChallengeLeaderboardScreen({ route }: Props): React.JSX.Element {
  const { challengeId, code } = route.params;
  const challenges = useChallengesStore((s) => s.challenges);
  const leaderboardByChallenge = useChallengesStore((s) => s.leaderboardByChallenge);
  const loadingId = useChallengesStore((s) => s.loadingLeaderboardId);
  const loadLeaderboard = useChallengesStore((s) => s.loadLeaderboard);
  const resolveInvite = useChallengesStore((s) => s.resolveInvite);

  const [resolvedId, setResolvedId] = useState<string | undefined>(challengeId);

  useEffect(() => {
    let active = true;
    async function init() {
      let id = challengeId;
      if (!id && code) {
        const challenge: Challenge = await resolveInvite(code);
        id = challenge.id;
      }
      if (active && id) {
        setResolvedId(id);
        loadLeaderboard(id);
      }
    }
    init().catch(() => {});
    return () => {
      active = false;
    };
  }, [challengeId, code, loadLeaderboard, resolveInvite]);

  const challenge = challenges.find((c) => c.id === resolvedId);
  const entries = resolvedId ? leaderboardByChallenge[resolvedId] ?? [] : [];
  const isLoading = loadingId === resolvedId && entries.length === 0;

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
        ListEmptyComponent={isLoading ? <ActivityIndicator color={colors.brandPrimary} style={styles.loader} /> : <Text style={styles.empty}>Ranking ainda vazio.</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brandBackground },
  list: { padding: 16, flexGrow: 1 },
  header: { marginBottom: 12, gap: 4 },
  title: { fontSize: 22, color: colors.brandAnchor, fontFamily: typography.fontFamily.bold },
  subtitle: { fontSize: 13, color: colors.brandTextMuted },
  invite: { marginTop: 12 },
  loader: { marginTop: 32 },
  empty: { textAlign: 'center', color: colors.brandTextMuted, marginTop: 32, fontSize: 14 },
});
