import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing } from '@theme';
import { useChallengesStore } from '../store';
import { ChallengeCard } from '../components/ChallengeCard';
import { EmptyChallengesState } from '../components/EmptyChallengesState';
import { MealCardSkeleton } from '@features/diet/components/MealCardSkeleton';
import { ErrorState } from '@shared/components';
import type { CommunityStackScreenProps } from '@navigation/types';

type Props = CommunityStackScreenProps<'Challenges'>;

export function ChallengesScreen({ navigation }: Props): React.JSX.Element {
  const challenges = useChallengesStore((s) => s.challenges);
  const isLoading = useChallengesStore((s) => s.isLoading);
  const joiningId = useChallengesStore((s) => s.joiningId);
  const load = useChallengesStore((s) => s.load);
  const join = useChallengesStore((s) => s.join);
  const checkIn = useChallengesStore((s) => s.checkIn);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    load().catch(() => { setHasError(true); });
  }, [load]);

  const goCreate = () => navigation.navigate('CreateChallenge');

  const reload = () => {
    setHasError(false);
    load().catch(() => { setHasError(true); });
  };

  // F3 da spec: encerrados (data-fim passada) vão para uma seção própria no
  // fim da lista — antes acumulavam misturados como "ativos" para sempre.
  const active = challenges.filter((c) => !c.finished);
  const finished = challenges.filter((c) => c.finished);
  const sections = [...active, ...finished];
  const firstFinishedId = finished[0]?.id;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Desafios</Text>
      </View>

      {isLoading && challenges.length === 0 ? (
        <View style={styles.listContent}>
          {[0, 1].map((i) => (
            <MealCardSkeleton key={i} />
          ))}
        </View>
      ) : hasError ? (
        <ErrorState onRetry={reload} />
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View>
              {item.id === firstFinishedId ? (
                <Text style={styles.sectionLabel}>Encerrados</Text>
              ) : null}
              <ChallengeCard
                challenge={item}
                joining={joiningId === item.id}
                onJoin={() => join(item.id).catch(() => {})}
                onCheckIn={item.joinedByMe && !item.finished ? () => void checkIn(item.id) : undefined}
                onPress={() => navigation.navigate('ChallengeLeaderboard', { challengeId: item.id })}
              />
            </View>
          )}
          ListEmptyComponent={<EmptyChallengesState onCreate={goCreate} />}
        />
      )}

      <Pressable style={styles.fab} onPress={goCreate} accessibilityRole='button' accessibilityLabel='Criar desafio'>
        <Text style={styles.fabIcon}>＋</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brandBackground },
  header: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  title: { fontSize: typography.fontSize.xl, color: colors.brandAnchor, fontFamily: typography.fontFamily.bold },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: 96, flexGrow: 1 },
  sectionLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.brandTextMuted,
    fontFamily: typography.fontFamily.semiBold,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  fab: {
    position: 'absolute', right: spacing.xl, bottom: spacing.xxl, width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.black, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 5,
  },
  fabIcon: { fontSize: 28, color: colors.white, lineHeight: 30 },
});
