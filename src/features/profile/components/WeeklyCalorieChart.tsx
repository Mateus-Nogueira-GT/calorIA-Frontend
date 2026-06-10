import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';
import { DayCalories } from '../hooks/useProfile';

interface WeeklyCalorieChartProps {
  data: DayCalories[];
}

const BAR_MAX_HEIGHT = 80;

export function WeeklyCalorieChart({ data }: WeeklyCalorieChartProps): React.JSX.Element {
  const maxCalories = Math.max(...data.map((d) => d.calories), 1);
  const total = data.reduce((sum, d) => sum + d.calories, 0);
  const avg = Math.round(total / data.length);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ESTA SEMANA</Text>
      <View style={styles.chart}>
        {data.map((day, index) => {
          const isToday = index === data.length - 1;
          const barHeight = Math.max((day.calories / maxCalories) * BAR_MAX_HEIGHT, 4);
          return (
            <View key={day.date} style={styles.barWrapper}>
              <View
                style={[
                  styles.bar,
                  { height: barHeight },
                  isToday ? styles.barToday : styles.barDefault,
                ]}
              />
              <Text style={[styles.label, isToday && styles.labelToday]}>{day.label}</Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.avg}>Média: {avg} kcal/dia</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 16,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: BAR_MAX_HEIGHT + 24,
  },
  barWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bar: {
    width: 20,
    borderRadius: 4,
    marginBottom: 4,
  },
  barDefault: {
    backgroundColor: colors.border,
  },
  barToday: {
    backgroundColor: colors.primary,
  },
  label: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
  },
  labelToday: {
    color: colors.primary,
    fontWeight: typography.fontWeight.semiBold,
  },
  avg: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 12,
  },
});
