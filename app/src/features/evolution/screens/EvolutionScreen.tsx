import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '@theme';
import { todayString } from '@shared/utils/date';
import { useEvolution } from '../hooks/useEvolution';
import { WeightInput } from '../components/WeightInput';
import { WeightLineChart } from '../components/WeightLineChart';
import { WeeklyCalorieChart } from '@features/profile/components/WeeklyCalorieChart';
import { StreakBadge } from '@features/profile/components/StreakBadge';
import { useProfile } from '@features/profile/hooks/useProfile';
import { ErrorState, screenShellStyle } from '@shared/components';

export function EvolutionScreen(): React.JSX.Element {
  const { entries, isSaving, addEntry, currentWeight, delta, hasError, reload } = useEvolution();
  const { weeklyData, streak } = useProfile();

  if (hasError) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ErrorState onRetry={reload} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Evolução</Text>

        <Text style={styles.section}>Peso</Text>
        {currentWeight !== null ? (
          <Text style={styles.summary}>Atual: {currentWeight} kg · {delta > 0 ? '+' : ''}{delta} kg no período</Text>
        ) : null}
        <WeightLineChart entries={entries} />
        <View style={styles.spacer} />
        <WeightInput onSave={(kg) => addEntry(kg, todayString()).catch(() => {})} saving={isSaving} />

        <Text style={styles.section}>Calorias</Text>
        <WeeklyCalorieChart data={weeklyData} />

        <Text style={styles.section}>Sequência</Text>
        {streak > 0 ? <StreakBadge days={streak} /> : <Text style={styles.summary}>Sem sequência ativa.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brandBackground },
  content: { ...screenShellStyle, padding: spacing.lg, gap: 10 },
  title: { fontSize: typography.fontSize.xl, color: colors.brandAnchor, fontFamily: typography.fontFamily.bold, marginBottom: spacing.xs },
  section: { fontSize: typography.fontSize.md, color: colors.brandAnchor, fontFamily: typography.fontFamily.semiBold, marginTop: spacing.lg },
  summary: { fontSize: typography.fontSize.sm, color: colors.brandTextMuted },
  spacer: { height: 12 },
});
