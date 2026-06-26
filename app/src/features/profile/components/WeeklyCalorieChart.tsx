import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@shared/components';
import { colors, radius, spacing, typography } from '@theme';
import { DayCalories } from '../hooks/useProfile';

interface WeeklyCalorieChartProps {
  data: DayCalories[];
}

const BAR_MAX_HEIGHT = 80;

export function WeeklyCalorieChart({ data }: WeeklyCalorieChartProps): React.JSX.Element {
  const maxCalories = Math.max(...data.map((d) => d.calories), 1);
  const total = data.reduce((sum, d) => sum + d.calories, 0);
  const avg = Math.round(total / data.length);
  const hasAnyCalories = data.some((day) => day.calories > 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Esta semana</Text>
        <Text style={styles.subtitle}>Media diaria</Text>
      </View>
      <View style={styles.chart}>
        {data.map((day, index) => {
          const isToday = index === data.length - 1;
          const barHeight = Math.max((day.calories / maxCalories) * BAR_MAX_HEIGHT, 4);
          return (
            <View key={day.date} style={styles.barWrapper}>
              <Text style={[styles.value, isToday && styles.valueToday]}>{day.calories} kcal</Text>
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
      <View style={styles.footer}>
        <Text style={styles.avg}>{avg} kcal</Text>
        <Text style={styles.avgCaption}>
          {hasAnyCalories ? 'Media dos ultimos 7 dias' : 'Sem registros nesta semana'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.brandSurface,
    borderRadius: 20,
    paddingHorizontal: spacing.xl,
    paddingVertical: 22,
    borderWidth: 1,
    borderColor: colors.brandDivider,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: 18,
  },
  title: {
    fontSize: typography.fontSize.lg,
    fontFamily: typography.fontFamily.bold,
    color: colors.brandAnchor,
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.brandTextMuted,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: BAR_MAX_HEIGHT + 56,
    gap: spacing.sm,
  },
  barWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    minWidth: 30,
  },
  value: {
    fontSize: typography.fontSize.xs,
    color: colors.brandTextMuted,
    marginBottom: 10,
    textAlign: 'center',
  },
  valueToday: {
    color: colors.brandAnchor,
    fontFamily: typography.fontFamily.semiBold,
  },
  bar: {
    width: 22,
    borderRadius: radius.pill,
    marginBottom: spacing.sm,
  },
  barDefault: {
    backgroundColor: colors.brandSupportSoft,
  },
  barToday: {
    backgroundColor: colors.brandPrimary,
    width: 24,
  },
  label: {
    fontSize: typography.fontSize.xs,
    color: colors.brandTextMuted,
    minHeight: 18,
  },
  labelToday: {
    color: colors.brandPrimary,
    fontFamily: typography.fontFamily.semiBold,
    backgroundColor: colors.brandPrimarySoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  footer: {
    marginTop: 18,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.brandDivider,
    alignItems: 'flex-start',
  },
  avg: {
    fontSize: typography.fontSize.xl,
    color: colors.brandPrimary,
    fontFamily: typography.fontFamily.extraBold,
  },
  avgCaption: {
    fontSize: typography.fontSize.sm,
    color: colors.brandTextMuted,
    marginTop: spacing.xs,
  },
});
