import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography } from '@theme';
import { todayString } from '@shared/utils/date';
import { useEvolution } from '../hooks/useEvolution';
import { WeightInput } from '../components/WeightInput';
import { WeightLineChart } from '../components/WeightLineChart';
import { WeeklyCalorieChart } from '@features/profile/components/WeeklyCalorieChart';
import { StreakBadge } from '@features/profile/components/StreakBadge';
import { useProfile } from '@features/profile/hooks/useProfile';

export function EvolutionScreen(): React.JSX.Element {
  const { entries, isSaving, addEntry, currentWeight, delta } = useEvolution();
  const { weeklyData, streak } = useProfile();

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
  content: { padding: 16, gap: 10 },
  title: { fontSize: typography.fontSize.xl, color: colors.brandAnchor, fontFamily: typography.fontFamily.bold, marginBottom: 4 },
  section: { fontSize: typography.fontSize.md, color: colors.brandAnchor, fontFamily: typography.fontFamily.semiBold, marginTop: 16 },
  summary: { fontSize: typography.fontSize.sm, color: colors.brandTextMuted },
  spacer: { height: 12 },
});
