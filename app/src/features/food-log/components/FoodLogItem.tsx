import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography, spacing, radius } from '@theme';
import { Meal } from '@shared/services/food-log.service';
import { parseDbDate } from '@shared/utils/parse-db-date';
import { isImplausibleMeal } from '@shared/utils/meal-plausibility';

interface Props {
  meal: Meal;
  onDelete: (id: string) => void | Promise<void>;
  /** Abre a edição (ex.: a IA errou a estimativa). */
  onEdit?: (meal: Meal) => void;
  hideBorder?: boolean;
}

function formatTime(loggedAt: string): string {
  const date = parseDbDate(loggedAt);
  // No Hermes o timestamp do Postgres virava Invalid Date → "Invalid Date" na UI.
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function DeleteGlyph(): React.JSX.Element {
  return (
    <View style={styles.deleteGlyph}>
      <View style={[styles.deleteStroke, styles.deleteStrokeA]} />
      <View style={[styles.deleteStroke, styles.deleteStrokeB]} />
    </View>
  );
}

export function FoodLogItem({ meal, onDelete, onEdit, hideBorder }: Props): React.JSX.Element {
  // Registro impossível: não exibe os números (não fazem sentido) e pede correção.
  const implausible = isImplausibleMeal(meal);
  const macros = implausible
    ? 'Valores impossíveis: não contam no dia. Corrija ou apague.'
    : `Proteínas ${meal.protein}g · Carboidratos ${meal.carbs}g · Gorduras ${meal.fat}g` +
      (meal.fiber != null ? ` · Fibras ${meal.fiber}g` : '');
  return (
    <View style={[styles.container, hideBorder && styles.containerLast]}>
      <View style={styles.info}>
        <View style={styles.titleRow}>
          <Text style={styles.name}>{meal.name}</Text>
          <Text style={styles.time}>{formatTime(meal.loggedAt)}</Text>
        </View>
        <Text style={[styles.macros, implausible && styles.invalid]}>{macros}</Text>
      </View>
      <View style={styles.right}>
        {implausible ? null : <Text style={styles.calories}>{meal.calories} kcal</Text>}
        <View style={styles.actions}>
          {onEdit ? (
            <TouchableOpacity
              onPress={() => onEdit(meal)}
              style={styles.editBtn}
              testID={`edit-${meal.id}`}
              accessibilityRole='button'
              accessibilityLabel={`Editar ${meal.name}`}
            >
              <Text style={styles.editLabel}>Editar</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={() => onDelete(meal.id)} style={styles.deleteBtn} testID={`delete-${meal.id}`} accessibilityRole='button'>
            <DeleteGlyph />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.brandDivider,
    gap: spacing.md,
  },
  containerLast: { borderBottomWidth: 0 },
  info: { flex: 1 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm },
  name: { fontSize: typography.fontSize.sm, fontFamily: typography.fontFamily.semiBold, color: colors.brandAnchor, flex: 1 },
  time: { fontSize: typography.fontSize.xs, color: colors.brandTextMuted },
  macros: { fontSize: typography.fontSize.xs, color: colors.brandText, marginTop: 6 },
  invalid: { color: colors.error },
  right: { alignItems: 'flex-end', gap: spacing.sm },
  calories: { fontSize: typography.fontSize.sm, fontFamily: typography.fontFamily.bold, color: colors.brandPrimary },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  editBtn: {
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandMutedSurface,
  },
  editLabel: {
    fontSize: typography.fontSize.xs,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.brandAnchor,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandMutedSurface,
  },
  deleteGlyph: {
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteStroke: {
    position: 'absolute',
    width: 12,
    height: 1.8,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
  },
  deleteStrokeA: { transform: [{ rotate: '45deg' }] },
  deleteStrokeB: { transform: [{ rotate: '-45deg' }] },
});
