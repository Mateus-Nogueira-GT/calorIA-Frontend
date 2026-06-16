import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@shared/components';
import { colors } from '@theme';
import type { PlannedMeal, MealType } from '@shared/services/diet.service';
import { MacroChips } from './MacroChips';
import { MealItemRow } from './MealItemRow';

interface Props {
  meal: PlannedMeal;
  isToggling: boolean;
  onToggleComplete: (mealId: string) => void;
}

const EMOJI: Record<MealType, string> = {
  breakfast: '🥐',
  lunch: '🍱',
  snack: '🍎',
  dinner: '🍽️',
};

export function MealPlanCard({ meal, isToggling, onToggleComplete }: Props): React.JSX.Element {
  const isDone = meal.completedAt !== null;
  return (
    <View style={[styles.card, isDone && styles.cardDone]}>
      <View style={styles.header}>
        <Text style={styles.emoji}>{EMOJI[meal.type]}</Text>
        <View style={styles.headerText}>
          <Text style={styles.title}>{meal.title}</Text>
          <Text style={styles.time}>{meal.suggestedTime}</Text>
        </View>
      </View>

      <MacroChips kcal={meal.calories} protein={meal.protein} carbs={meal.carbs} fat={meal.fat} />

      <View style={styles.items}>
        {meal.items.map((item, idx) => (
          <MealItemRow key={`${meal.id}-${idx}`} item={item} />
        ))}
      </View>

      <TouchableOpacity
        accessibilityRole="button"
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
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  cardDone: { borderColor: colors.primary, backgroundColor: '#F6FBF8' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  emoji: { fontSize: 28 },
  headerText: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  time: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  items: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginBottom: 10 },
  btn: {
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  btnDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  btnTextDone: { color: colors.white },
});
