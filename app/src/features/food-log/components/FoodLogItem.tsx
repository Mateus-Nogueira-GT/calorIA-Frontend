import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';
import { Meal } from '@shared/services/food-log.service';

interface Props { meal: Meal; onDelete: (id: string) => void | Promise<void>; hideBorder?: boolean }

function formatTime(loggedAt: string): string {
  const date = new Date(loggedAt);
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

export function FoodLogItem({ meal, onDelete, hideBorder }: Props): React.JSX.Element {
  return (
    <View style={[styles.container, hideBorder && styles.containerLast]}>
      <View style={styles.info}>
        <View style={styles.titleRow}>
          <Text style={styles.name}>{meal.name}</Text>
          <Text style={styles.time}>{formatTime(meal.loggedAt)}</Text>
        </View>
        <Text style={styles.macros}>Proteínas {meal.protein}g · Carboidratos {meal.carbs}g · Gorduras {meal.fat}g</Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.calories}>{meal.calories} kcal</Text>
        <TouchableOpacity onPress={() => onDelete(meal.id)} style={styles.deleteBtn} testID={`delete-${meal.id}`} accessibilityRole='button'>
          <DeleteGlyph />
        </TouchableOpacity>
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
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.brandDivider,
    gap: 12,
  },
  containerLast: { borderBottomWidth: 0 },
  info: { flex: 1 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  name: { fontSize: typography.fontSize.sm, fontFamily: typography.fontFamily.semiBold, color: colors.brandAnchor, flex: 1 },
  time: { fontSize: typography.fontSize.xs, color: colors.brandTextMuted },
  macros: { fontSize: typography.fontSize.xs, color: colors.brandText, marginTop: 6 },
  right: { alignItems: 'flex-end', gap: 8 },
  calories: { fontSize: typography.fontSize.sm, fontFamily: typography.fontFamily.bold, color: colors.brandPrimary },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
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
    borderRadius: 999,
    backgroundColor: colors.brandPrimary,
  },
  deleteStrokeA: { transform: [{ rotate: '45deg' }] },
  deleteStrokeB: { transform: [{ rotate: '-45deg' }] },
});
