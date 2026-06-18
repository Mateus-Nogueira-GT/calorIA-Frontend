import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';
import { useAuthStore } from '@features/auth/store';
import { useFoodLogStore } from '@features/food-log/store';
import { foodLogService } from '@shared/services/food-log.service';
import { useDietStore } from '@features/diet/store';
import { todayString } from '@shared/utils/date';
import { CalorieRing } from '../components/CalorieRing';
import { MacroCard } from '../components/MacroCard';
import { MealListItem } from '../components/MealListItem';
import { DietPlanSection } from '@features/diet/components/DietPlanSection';

const DEFAULT_CALORIE_GOAL = 2000;
const DEFAULT_PROTEIN_GOAL = 150;
const DEFAULT_CARBS_GOAL = 250;
const DEFAULT_FAT_GOAL = 65;

const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function todayLabel(): string {
  const d = new Date();
  return `${DAYS_PT[d.getDay()]}, ${d.getDate()} ${MONTHS_PT[d.getMonth()]}`;
}

function DashboardMealSkeleton(): React.JSX.Element {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.skeletonTitle} />
      <View style={styles.skeletonMealRow}>
        <View style={styles.skeletonMealMain} />
        <View style={styles.skeletonMealKcal} />
      </View>
      <View style={styles.skeletonMealRow}>
        <View style={styles.skeletonMealSecondary} />
        <View style={styles.skeletonMealKcal} />
      </View>
      <View style={styles.skeletonMealRow}>
        <View style={styles.skeletonMealMain} />
        <View style={styles.skeletonMealKcal} />
      </View>
    </View>
  );
}

export function DashboardScreen(): React.JSX.Element {
  const user = useAuthStore((s) => s.user);
  const today = todayString();
  const [foodLogError, setFoodLogError] = useState(false);

  const foodLogMeals = useFoodLogStore((s) => s.mealsByDate[today] ?? []);
  const setMeals = useFoodLogStore((s) => s.setMeals);
  const isFoodLogLoading = useFoodLogStore((s) => s.loadingByDate[today] ?? false);
  const setFoodLogLoading = useFoodLogStore((s) => s.setLoading);

  const plan = useDietStore((s) => s.plan);
  const loadCurrentDiet = useDietStore((s) => s.loadCurrent);

  useEffect(() => {
    if (useFoodLogStore.getState().mealsByDate[today] === undefined) {
      setFoodLogError(false);
      setFoodLogLoading(today, true);
      foodLogService
        .getMeals(today)
        .then((data) => setMeals(today, data))
        .catch(() => setFoodLogError(true))
        .finally(() => setFoodLogLoading(today, false));
    }
    if (useDietStore.getState().plan === undefined) {
      loadCurrentDiet();
    }
  }, [today, setFoodLogLoading, setMeals, loadCurrentDiet]);

  const completedPlannedMeals = (plan?.meals ?? []).filter((m) => m.completedAt !== null);
  const useDietForTotals = plan != null;

  const totals = useDietForTotals
    ? completedPlannedMeals.reduce(
        (acc, m) => ({
          calories: acc.calories + m.calories,
          protein: acc.protein + m.protein,
          carbs: acc.carbs + m.carbs,
          fat: acc.fat + m.fat,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      )
    : foodLogMeals.reduce(
        (acc, m) => ({
          calories: acc.calories + m.calories,
          protein: acc.protein + m.protein,
          carbs: acc.carbs + m.carbs,
          fat: acc.fat + m.fat,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      );

  const calorieGoal = plan?.totalCalories ?? DEFAULT_CALORIE_GOAL;
  const proteinGoal = plan?.totalProtein ?? DEFAULT_PROTEIN_GOAL;
  const carbsGoal = plan?.totalCarbs ?? DEFAULT_CARBS_GOAL;
  const fatGoal = plan?.totalFat ?? DEFAULT_FAT_GOAL;
  const greetingLabel = user?.name ? `Ola, ${user.name}` : 'Seu resumo de hoje';
  const percentLabel = calorieGoal > 0 ? Math.round((totals.calories / calorieGoal) * 100) : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.shell}>
        <View style={styles.headerRow}>
          <Text style={styles.date}>{todayLabel()}</Text>
          <Text style={styles.greeting}>{greetingLabel}</Text>
          <Text style={styles.headerHint}>Calorias, macros e o que ainda falta no seu dia.</Text>
        </View>

        <View style={styles.ringCard}>
          <View style={styles.ringSummary}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Resumo calorico</Text>
            </View>
            <Text style={styles.kcalValue}>{totals.calories}</Text>
            <Text style={styles.kcalGoal}>de {calorieGoal} kcal</Text>
            <View style={styles.progressMeta}>
              <Text style={styles.progressMetaLabel}>Meta diaria</Text>
              <Text style={styles.progressMetaValue}>{percentLabel}%</Text>
            </View>
          </View>
          <CalorieRing current={totals.calories} goal={calorieGoal} size={132} />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Macronutrientes</Text>
          <Text style={styles.sectionSubtitle}>Distribuicao consumida em relacao a meta atual.</Text>
        </View>

        <View style={styles.macroGrid}>
          <MacroCard label='Proteina' current={totals.protein} goal={proteinGoal} color={colors.brandPrimary} />
          <MacroCard label='Carboidratos' current={totals.carbs} goal={carbsGoal} color={colors.brandAnchor} />
          <MacroCard label='Gordura' current={totals.fat} goal={fatGoal} color={colors.brandSupport} />
        </View>

        <DietPlanSection />

        <View style={[styles.sectionHeader, styles.freeDiaryHeader]}>
          <Text style={styles.sectionTitle}>Diario alimentar</Text>
          <Text style={styles.sectionSubtitle}>Registros adicionados fora do plano do dia.</Text>
        </View>

        {isFoodLogLoading ? (
          <DashboardMealSkeleton />
        ) : foodLogError ? (
          <View style={styles.feedbackCard}>
            <Text style={styles.feedbackTitle}>Nao foi possivel carregar o diario livre</Text>
            <Text style={styles.feedbackText}>Atualize a pagina ou tente novamente em instantes.</Text>
          </View>
        ) : foodLogMeals.length > 0 ? (
          <View style={styles.sectionCard}>
            {foodLogMeals.map((meal, index) => (
              <MealListItem key={meal.id} meal={meal} hideBorder={index === foodLogMeals.length - 1} />
            ))}
          </View>
        ) : (
          <View style={styles.feedbackCard}>
            <Text style={styles.feedbackTitle}>Nada registrado por aqui ainda</Text>
            <Text style={styles.feedbackText}>Quando voce adicionar algo no diario livre, ele aparece nesta secao.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.brandBackground, paddingTop: 56 },
  content: { paddingHorizontal: 16, paddingBottom: 110 },
  shell: { width: '100%', maxWidth: 760, alignSelf: 'center' },
  headerRow: { marginBottom: 24 },
  greeting: {
    fontSize: typography.fontSize.xxl,
    fontFamily: typography.fontFamily.extraBold,
    color: colors.brandAnchor,
    marginTop: 6,
  },
  date: { fontSize: typography.fontSize.sm, color: colors.brandTextMuted, fontFamily: typography.fontFamily.medium },
  headerHint: { fontSize: typography.fontSize.sm, color: colors.brandTextMuted, marginTop: 6 },
  ringCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    backgroundColor: colors.brandSurface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    padding: 22,
    marginBottom: 20,
  },
  ringSummary: { flex: 1, minWidth: 0 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brandMutedSurface,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 12,
  },
  badgeText: { fontSize: typography.fontSize.xs, color: colors.brandAnchor, fontFamily: typography.fontFamily.semiBold },
  kcalValue: {
    fontSize: typography.fontSize.xxxl,
    fontFamily: typography.fontFamily.extraBold,
    color: colors.brandAnchor,
  },
  kcalGoal: { fontSize: typography.fontSize.base, color: colors.brandTextMuted, marginTop: 2 },
  progressMeta: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  progressMetaLabel: { fontSize: typography.fontSize.sm, color: colors.brandTextMuted },
  progressMetaValue: { fontSize: typography.fontSize.md, color: colors.brandPrimary, fontFamily: typography.fontFamily.bold },
  sectionHeader: { marginBottom: 12 },
  freeDiaryHeader: { marginTop: 20 },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontFamily: typography.fontFamily.bold,
    color: colors.brandAnchor,
  },
  sectionSubtitle: { fontSize: typography.fontSize.sm, color: colors.brandTextMuted, marginTop: 4 },
  macroGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  sectionCard: {
    backgroundColor: colors.brandSurface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    overflow: 'hidden',
  },
  feedbackCard: {
    backgroundColor: colors.brandSurface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    padding: 18,
  },
  feedbackTitle: { fontSize: typography.fontSize.base, fontFamily: typography.fontFamily.bold, color: colors.brandAnchor },
  feedbackText: { fontSize: typography.fontSize.sm, color: colors.brandTextMuted, marginTop: 4 },
  skeletonTitle: {
    height: 14,
    width: '34%',
    borderRadius: 999,
    backgroundColor: colors.brandTrack,
    margin: 18,
    marginBottom: 8,
  },
  skeletonMealRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.brandDivider,
    gap: 12,
  },
  skeletonMealMain: { height: 14, flex: 1, borderRadius: 999, backgroundColor: colors.brandTrack },
  skeletonMealSecondary: { height: 14, width: '58%', borderRadius: 999, backgroundColor: colors.brandTrack },
  skeletonMealKcal: { height: 14, width: 64, borderRadius: 999, backgroundColor: colors.brandTrack },
});
