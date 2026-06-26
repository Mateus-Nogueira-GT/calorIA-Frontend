import React, { useEffect } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography } from '@theme';
import { useChallengesStore } from '../store';
import { ChallengeCard } from '../components/ChallengeCard';
import { EmptyChallengesState } from '../components/EmptyChallengesState';
import { MealCardSkeleton } from '@features/diet/components/MealCardSkeleton';
import type { CommunityStackScreenProps } from '@navigation/types';

type Props = CommunityStackScreenProps<'Challenges'>;

export function ChallengesScreen({ navigation }: Props): React.JSX.Element {
  const challenges = useChallengesStore((s) => s.challenges);
  const isLoading = useChallengesStore((s) => s.isLoading);
  const joiningId = useChallengesStore((s) => s.joiningId);
  const load = useChallengesStore((s) => s.load);
  const join = useChallengesStore((s) => s.join);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const goCreate = () => navigation.navigate('CreateChallenge');

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
      ) : (
        <FlatList
          data={challenges}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <ChallengeCard
              challenge={item}
              joining={joiningId === item.id}
              onJoin={() => join(item.id).catch(() => {})}
              onPress={() => navigation.navigate('ChallengeLeaderboard', { challengeId: item.id })}
            />
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
  header: { paddingHorizontal: 20, paddingVertical: 12 },
  title: { fontSize: 24, color: colors.brandAnchor, fontFamily: typography.fontFamily.bold },
  listContent: { paddingHorizontal: 16, paddingBottom: 96, flexGrow: 1 },
  fab: {
    position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.black, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 5,
  },
  fabIcon: { fontSize: 28, color: colors.white, lineHeight: 30 },
});
