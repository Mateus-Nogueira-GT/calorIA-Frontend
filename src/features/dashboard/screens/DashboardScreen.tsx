import React, { useEffect } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';
import { useAuthStore } from '@features/auth/store';
import { useFoodLogStore } from '@features/food-log/store';
import { foodLogService } from '@shared/services/food-log.service';
import { todayString } from '@shared/utils/date';
import { CalorieRing } from '../components/CalorieRing';
import { MacroCard } from '../components/MacroCard';
import { MealListItem } from '../components/MealListItem';

const CALORIE_GOAL = 2000;
const PROTEIN_GOAL = 150;
const CARBS_GOAL = 250;
const FAT_GOAL = 65;

const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function todayLabel(): string {
  const d = new Date();
  return `${DAYS_PT[d.getDay()]}, ${d.getDate()} ${MONTHS_PT[d.getMonth()]}`;
}

export function DashboardScreen(): React.JSX.Element {
  const user = useAuthStore((s) => s.user);
  const today = todayString();
  const meals = useFoodLogStore((s) => s.mealsByDate[today] ?? []);
  const setMeals = useFoodLogStore((s) => s.setMeals);
  const isLoading = useFoodLogStore((s) => s.isLoading);
  const setLoading = useFoodLogStore((s) => s.setLoading);

  useEffect(() => {
    if (useFoodLogStore.getState().mealsByDate[today] !== undefined) return;
    setLoading(true);
    foodLogService.getMeals(today)
      .then((data) => setMeals(today, data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [today]);

  const totals = meals.reduce(
    (acc, m) => ({ calories: acc.calories + m.calories, protein: acc.protein + m.protein, carbs: acc.carbs + m.carbs, fat: acc.fat + m.fat }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.greeting}>Olá, {user?.name ?? 'visitante'} 👋</Text>
        <Text style={styles.date}>{todayLabel()}</Text>
      </View>

      <View style={styles.ringCard}>
        <CalorieRing current={totals.calories} goal={CALORIE_GOAL} size={110} />
        <View style={styles.ringInfo}>
          <Text style={styles.kcalLabel}>CALORIAS HOJE</Text>
          <Text style={styles.kcalValue}>{totals.calories}</Text>
          <Text style={styles.kcalGoal}>de {CALORIE_GOAL} kcal</Text>
        </View>
      </View>

      <View style={styles.macroRow}>
        <MacroCard label="Proteína" current={totals.protein} goal={PROTEIN_GOAL} color="#FF8C42" />
        <View style={styles.macroGap} />
        <MacroCard label="Carboidratos" current={totals.carbs} goal={CARBS_GOAL} color="#17A2B8" />
        <View style={styles.macroGap} />
        <MacroCard label="Gordura" current={totals.fat} goal={FAT_GOAL} color="#FFC107" />
      </View>

      {isLoading ? (
        <Text style={styles.loadingText}>Carregando refeições...</Text>
      ) : meals.length > 0 ? (
        <View style={styles.mealsCard}>
          <Text style={styles.mealsTitle}>REFEIÇÕES DE HOJE</Text>
          {meals.map((m) => <MealListItem key={m.id} meal={m} />)}
        </View>
      ) : (
        <View style={styles.emptyMeals}>
          <Text style={styles.emptyText}>Nenhuma refeição registrada hoje.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 56 },
  content: { padding: 16 },
  headerRow: { marginBottom: 20 },
  greeting: { fontSize: typography.fontSize.xl, fontFamily: typography.fontFamily.bold, color: colors.textPrimary },
  date: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  ringCard: { flexDirection: 'row', alignItems: 'center', gap: 20, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 12 },
  ringInfo: {},
  kcalLabel: { fontSize: typography.fontSize.xs, color: colors.textSecondary, fontFamily: typography.fontFamily.semiBold, letterSpacing: 0.5 },
  kcalValue: { fontSize: typography.fontSize.xxl, fontFamily: typography.fontFamily.extraBold, color: colors.textPrimary },
  kcalGoal: { fontSize: typography.fontSize.sm, color: colors.textSecondary },
  macroRow: { flexDirection: 'row', marginBottom: 16 },
  macroGap: { width: 8 },
  mealsCard: { backgroundColor: colors.white, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  mealsTitle: { fontSize: typography.fontSize.xs, fontFamily: typography.fontFamily.bold, color: colors.textSecondary, letterSpacing: 0.5, padding: 12, paddingBottom: 8 },
  loadingText: { color: colors.textSecondary, textAlign: 'center', marginTop: 16 },
  emptyMeals: { alignItems: 'center', paddingTop: 24 },
  emptyText: { color: colors.textSecondary, fontSize: typography.fontSize.sm },
});
