import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@shared/components';
import { colors, radius, spacing, typography } from '@theme';
import type { MealType, PlannedMeal } from '@shared/services/diet.service';
import { MacroChips } from './MacroChips';
import { MealItemRow } from './MealItemRow';

interface Props {
  meal: PlannedMeal;
  isToggling: boolean;
  onToggleComplete: (mealId: string) => void;
}

const MEAL_TYPE_LABEL: Record<MealType, string> = {
  breakfast: 'Cafe da manha',
  lunch: 'Almoco',
  snack: 'Lanche',
  dinner: 'Jantar',
};

export function MealPlanCard({ meal, isToggling, onToggleComplete }: Props): React.JSX.Element {
  const isDone = meal.completedToday;
  return (
    <View style={[styles.card, isDone && styles.cardDone]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <View style={styles.metaRow}>
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>{MEAL_TYPE_LABEL[meal.type]}</Text>
            </View>
            <Text style={styles.time}>{meal.suggestedTime}</Text>
          </View>
          <Text style={styles.title}>{meal.title}</Text>
        </View>
      </View>

      <MacroChips kcal={meal.calories} protein={meal.protein} carbs={meal.carbs} fat={meal.fat} />

      <View style={styles.items}>
        {meal.items.map((item, idx) => (
          <MealItemRow key={`${meal.id}-${idx}`} item={item} />
        ))}
      </View>

      <TouchableOpacity
        accessibilityRole='button'
        accessibilityState={{ disabled: isToggling, selected: isDone }}
        disabled={isToggling}
        onPress={() => onToggleComplete(meal.id)}
        style={[styles.btn, isDone && styles.btnDone, isToggling && styles.btnDisabled]}
      >
        <Text style={[styles.btnText, isDone && styles.btnTextDone]}>
          {isDone ? '✓ Concluída' : 'Marcar como concluída'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.brandSurface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardDone: { borderColor: colors.brandPrimary, backgroundColor: colors.brandMutedSurface },
  header: { marginBottom: spacing.md },
  headerText: { flex: 1 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: spacing.sm },
  typeBadge: {
    backgroundColor: colors.brandMutedSurface,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  typeBadgeText: { fontSize: typography.fontSize.xs, color: colors.brandAnchor, fontFamily: typography.fontFamily.semiBold },
  title: { fontSize: typography.fontSize.base, fontFamily: typography.fontFamily.bold, color: colors.brandAnchor },
  time: { fontSize: typography.fontSize.xs, color: colors.brandTextMuted },
  items: { borderTopWidth: 1, borderTopColor: colors.brandDivider, paddingTop: 10, marginBottom: spacing.md },
  btn: {
    minHeight: 44,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.transparent,
    borderWidth: 1,
    borderColor: colors.brandDividerStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDone: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontSize: typography.fontSize.sm, fontFamily: typography.fontFamily.semiBold, color: colors.brandAnchor },
  btnTextDone: { color: colors.brandAnchor },
});
