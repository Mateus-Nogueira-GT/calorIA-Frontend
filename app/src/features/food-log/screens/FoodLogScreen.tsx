import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ErrorState, Text, screenShellStyle } from '@shared/components';
import { colors, typography, spacing, radius } from '@theme';
import { useFoodLog } from '../hooks/useFoodLog';
import { DateChip } from '../components/DateChip';
import { DayMacroSummary } from '../components/DayMacroSummary';
import { MealSection } from '../components/MealSection';
import { AddMealModal } from '../components/AddMealModal';
import { CalorieProgressBar } from '../components/CalorieProgressBar';
import { formatChipLabel, getMealGroupFor, last7Days, todayString } from '@shared/utils/date';
import { getDailyCalorieGoal, getDayTotals } from '@shared/utils/calories';
import { useDietStore } from '@features/diet/store';

const GROUPS = ['Café da manhã', 'Almoço', 'Lanche', 'Jantar'] as const;
const addMealLabel = 'Adicionar refeição';
const emptyTitle = 'Nenhuma refeição registrada neste dia.';
const emptySubtitle = 'Registre sua primeira refeição para acompanhar o consumo diário.';

function AddMealGlyph(): React.JSX.Element {
  return (
    <View style={styles.addGlyph}>
      <View style={styles.addGlyphVertical} />
      <View style={styles.addGlyphHorizontal} />
    </View>
  );
}

function DiaryEmptyIcon(): React.JSX.Element {
  return (
    <View style={styles.emptyIcon}>
      <View style={styles.emptyIconSpine} />
      <View style={styles.emptyIconPage} />
      <View style={styles.emptyIconLineShort} />
      <View style={styles.emptyIconLineLong} />
    </View>
  );
}

export function FoodLogScreen(): React.JSX.Element {
  const { meals, isLoading, hasError, reload, selectedDate, setSelectedDate, handleAddMeal, handleDeleteMeal } = useFoodLog();
  const plan = useDietStore((s) => s.plan);
  const [modalVisible, setModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void Promise.resolve(reload()).finally(() => setRefreshing(false));
  }, [reload]);
  const dates = last7Days();

  // M6: mesma regra do Dashboard. O `plan` em memória é só o dia de HOJE
  // (completedToday não diz nada sobre dias anteriores), então em dias passados
  // somamos apenas o diário livre — é o único dado real que existe para eles.
  const isToday = selectedDate === todayString();
  const consumed = getDayTotals({
    planMeals: isToday ? plan?.meals : undefined,
    freeMeals: meals,
  }).calories;
  const goal = getDailyCalorieGoal(plan);

  const grouped = useMemo(
    () =>
      GROUPS.reduce<Record<string, typeof meals>>((acc, group) => {
        acc[group] = meals.filter(
          (meal) => getMealGroupFor(meal.mealType, meal.loggedAt) === group,
        );
        return acc;
      }, {}),
    [meals],
  );

  function openAddMealFlow() {
    setModalVisible(true);
  }

  return (
    <View style={styles.container}>
      <View style={styles.shell}>
        <View style={styles.header}>
          <Text style={styles.title}>Diário alimentar</Text>
          <TouchableOpacity onPress={openAddMealFlow} style={styles.addBtn} accessibilityRole='button' testID='food-log-add-button'>
            <AddMealGlyph />
            <Text style={styles.addBtnText}>{addMealLabel}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chips}
          contentContainerStyle={styles.chipsContent}
        >
          {dates.map((date) => (
            <DateChip
              key={date}
              label={formatChipLabel(date)}
              selected={date === selectedDate}
              onPress={() => setSelectedDate(date)}
            />
          ))}
        </ScrollView>

        {isLoading ? (
          <View style={styles.center}>
            <Text style={styles.loadingText}>Carregando refeições...</Text>
          </View>
        ) : hasError ? (
          <ErrorState onRetry={reload} />
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          >
            <CalorieProgressBar consumed={consumed} goal={goal} />
            <DayMacroSummary meals={meals} />
            {meals.length === 0 ? (
              <View style={styles.emptyState}>
                <DiaryEmptyIcon />
                <Text style={styles.emptyTitle}>{emptyTitle}</Text>
                <Text style={styles.emptySubtitle}>{emptySubtitle}</Text>
                <TouchableOpacity onPress={openAddMealFlow} style={styles.emptyCta} accessibilityRole='button'>
                  <AddMealGlyph />
                  <Text style={styles.emptyCtaText}>{addMealLabel}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.sections}>
                {GROUPS.map((group) => (
                  <MealSection key={group} title={group} meals={grouped[group] ?? []} onDelete={handleDeleteMeal} />
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </View>

      <AddMealModal visible={modalVisible} onClose={() => setModalVisible(false)} onSubmit={handleAddMeal} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.brandBackground, paddingTop: 56 },
  shell: { ...screenShellStyle, flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  title: {
    fontSize: typography.fontSize.xl,
    fontFamily: typography.fontFamily.bold,
    color: colors.brandAnchor,
  },
  addBtn: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.brandPrimary,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
  },
  addBtnText: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.brandAnchor,
  },
  addGlyph: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addGlyphVertical: {
    position: 'absolute',
    width: 2,
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.brandAnchor,
  },
  addGlyphHorizontal: {
    width: 12,
    height: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.brandAnchor,
  },
  chips: { maxHeight: 58 },
  chipsContent: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 110 },
  sections: { marginTop: 18 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: colors.brandTextMuted, fontSize: typography.fontSize.sm },
  emptyState: {
    minHeight: 360,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: spacing.xxxl,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.brandDividerStrong,
    backgroundColor: colors.brandSurface,
    marginBottom: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyIconSpine: {
    position: 'absolute',
    left: 12,
    top: 10,
    bottom: 10,
    width: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.brandAnchor,
  },
  emptyIconPage: {
    width: 24,
    height: 28,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.brandDividerStrong,
    backgroundColor: colors.brandMutedSurface,
    marginLeft: spacing.sm,
  },
  emptyIconLineShort: {
    position: 'absolute',
    right: 12,
    top: 18,
    width: 10,
    height: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.brandAnchor,
  },
  emptyIconLineLong: {
    position: 'absolute',
    right: 12,
    top: 26,
    width: 14,
    height: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTextMuted,
  },
  emptyTitle: {
    fontSize: typography.fontSize.md,
    fontFamily: typography.fontFamily.bold,
    color: colors.brandAnchor,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.brandTextMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 320,
  },
  emptyCta: {
    marginTop: 18,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    backgroundColor: colors.brandPrimary,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
  },
  emptyCtaText: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.brandAnchor,
  },
});
