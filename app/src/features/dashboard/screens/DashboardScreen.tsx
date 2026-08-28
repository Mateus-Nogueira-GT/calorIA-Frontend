import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ErrorState, Text } from '@shared/components';
import { colors, typography, spacing, radius } from '@theme';
import { useAuthStore } from '@features/auth/store';
import { useFoodLogStore } from '@features/food-log/store';
import { foodLogService } from '@shared/services/food-log.service';
import { useDietStore } from '@features/diet/store';
import { todayString } from '@shared/utils/date';
import { getDailyCalorieGoal } from '@shared/utils/calories';
import { CalorieRing } from '../components/CalorieRing';
import { MacroCard } from '../components/MacroCard';
import { MealListItem } from '../components/MealListItem';
import { DietPlanSection } from '@features/diet/components/DietPlanSection';

const DEFAULT_PROTEIN_GOAL = 150;
const DEFAULT_CARBS_GOAL = 250;
const DEFAULT_FAT_GOAL = 65;

const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
const MONTHS_PT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

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

  /**
   * `force` ignora o cache — é o caminho do retry e do pull-to-refresh.
   * O portão normal é `syncedDates`, não `mealsByDate`: escrita local do
   * scanner criava a chave sem o dia ter sido carregado, e o dia ficava preso
   * com um item só (as refeições já salvas sumiam até reiniciar o app).
   */
  const loadFoodLog = useCallback(
    (force = false) => {
      if (!force && useFoodLogStore.getState().syncedDates[today]) return Promise.resolve();
      setFoodLogError(false);
      setFoodLogLoading(today, true);
      return foodLogService
        .getMeals(today)
        .then((data) => setMeals(today, data))
        .catch(() => setFoodLogError(true))
        .finally(() => setFoodLogLoading(today, false));
    },
    [today, setFoodLogLoading, setMeals],
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void Promise.all([loadFoodLog(true), loadCurrentDiet()]).finally(() => setRefreshing(false));
  }, [loadFoodLog, loadCurrentDiet]);

  useEffect(() => {
    void loadFoodLog();
    if (useDietStore.getState().plan === undefined) {
      loadCurrentDiet();
    }
  }, [loadFoodLog, loadCurrentDiet]);

  // D1 da spec: o anel soma o que a pessoa REALMENTE comeu — refeições do
  // plano concluídas hoje + diário livre (inclui itens do scanner). Antes,
  // com dieta ativa, o diário era ignorado e a contagem ficava errada.
  const completedPlannedMeals = (plan?.meals ?? []).filter((m) => m.completedToday);
  const sumMacros = (items: { calories: number; protein: number; carbs: number; fat: number }[]) =>
    items.reduce(
      (acc, m) => ({
        calories: acc.calories + m.calories,
        protein: acc.protein + m.protein,
        carbs: acc.carbs + m.carbs,
        fat: acc.fat + m.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    );
  const plannedTotals = sumMacros(completedPlannedMeals);
  const freeTotals = sumMacros(foodLogMeals);
  const totals = {
    calories: plannedTotals.calories + freeTotals.calories,
    protein: plannedTotals.protein + freeTotals.protein,
    carbs: plannedTotals.carbs + freeTotals.carbs,
    fat: plannedTotals.fat + freeTotals.fat,
  };

  const calorieGoal = getDailyCalorieGoal(plan);
  const proteinGoal = plan?.totalProtein ?? DEFAULT_PROTEIN_GOAL;
  const carbsGoal = plan?.totalCarbs ?? DEFAULT_CARBS_GOAL;
  const fatGoal = plan?.totalFat ?? DEFAULT_FAT_GOAL;
  const greetingLabel = user?.name ? `Ola, ${user.name}` : 'Seu resumo de hoje';
  const percentLabel = calorieGoal > 0 ? Math.round((totals.calories / calorieGoal) * 100) : 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
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
          <Text style={styles.sectionSubtitle}>
            Distribuicao consumida em relacao a meta atual.
          </Text>
        </View>

        <View style={styles.macroGrid}>
          <MacroCard
            label="Proteina"
            current={totals.protein}
            goal={proteinGoal}
            color={colors.brandPrimary}
          />
          <MacroCard
            label="Carboidratos"
            current={totals.carbs}
            goal={carbsGoal}
            color={colors.brandAnchor}
          />
          <MacroCard
            label="Gordura"
            current={totals.fat}
            goal={fatGoal}
            color={colors.brandSupport}
          />
        </View>

        <DietPlanSection />

        <View style={[styles.sectionHeader, styles.freeDiaryHeader]}>
          <Text style={styles.sectionTitle}>Diario alimentar</Text>
          <Text style={styles.sectionSubtitle}>Registros adicionados fora do plano do dia.</Text>
        </View>

        {isFoodLogLoading ? (
          <DashboardMealSkeleton />
        ) : foodLogError ? (
          <ErrorState
            title="Não foi possível carregar o diário livre"
            onRetry={() => void loadFoodLog(true)}
          />
        ) : foodLogMeals.length > 0 ? (
          <View style={styles.sectionCard}>
            {foodLogMeals.map((meal, index) => (
              <MealListItem
                key={meal.id}
                meal={meal}
                hideBorder={index === foodLogMeals.length - 1}
              />
            ))}
          </View>
        ) : (
          <View style={styles.feedbackCard}>
            <Text style={styles.feedbackTitle}>Nada registrado por aqui ainda</Text>
            <Text style={styles.feedbackText}>
              Quando voce adicionar algo no diario livre, ele aparece nesta secao.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.brandBackground, paddingTop: 56 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 110 },
  shell: { width: '100%', maxWidth: 760, alignSelf: 'center' },
  headerRow: { marginBottom: spacing.xxl },
  greeting: {
    fontSize: typography.fontSize.xxl,
    fontFamily: typography.fontFamily.extraBold,
    color: colors.brandAnchor,
    marginTop: 6,
  },
  date: {
    fontSize: typography.fontSize.sm,
    color: colors.brandTextMuted,
    fontFamily: typography.fontFamily.medium,
  },
  headerHint: { fontSize: typography.fontSize.sm, color: colors.brandTextMuted, marginTop: 6 },
  ringCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    backgroundColor: colors.brandSurface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    padding: 22,
    marginBottom: spacing.xl,
  },
  ringSummary: { flex: 1, minWidth: 0 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brandMutedSurface,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: spacing.md,
  },
  badgeText: {
    fontSize: typography.fontSize.xs,
    color: colors.brandAnchor,
    fontFamily: typography.fontFamily.semiBold,
  },
  kcalValue: {
    fontSize: typography.fontSize.xxxl,
    fontFamily: typography.fontFamily.extraBold,
    color: colors.brandAnchor,
  },
  kcalGoal: { fontSize: typography.fontSize.base, color: colors.brandTextMuted, marginTop: 2 },
  progressMeta: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  progressMetaLabel: { fontSize: typography.fontSize.sm, color: colors.brandTextMuted },
  progressMetaValue: {
    fontSize: typography.fontSize.md,
    color: colors.brandPrimary,
    fontFamily: typography.fontFamily.bold,
  },
  sectionHeader: { marginBottom: spacing.md },
  freeDiaryHeader: { marginTop: spacing.xl },
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
    marginBottom: spacing.sm,
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
  feedbackTitle: {
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.bold,
    color: colors.brandAnchor,
  },
  feedbackText: { fontSize: typography.fontSize.sm, color: colors.brandTextMuted, marginTop: 4 },
  skeletonTitle: {
    height: 14,
    width: '34%',
    borderRadius: radius.pill,
    backgroundColor: colors.brandTrack,
    margin: 18,
    marginBottom: spacing.sm,
  },
  skeletonMealRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.brandDivider,
    gap: spacing.md,
  },
  skeletonMealMain: {
    height: 14,
    flex: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTrack,
  },
  skeletonMealSecondary: {
    height: 14,
    width: '58%',
    borderRadius: radius.pill,
    backgroundColor: colors.brandTrack,
  },
  skeletonMealKcal: {
    height: 14,
    width: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTrack,
  },
});
