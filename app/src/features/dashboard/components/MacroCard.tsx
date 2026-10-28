import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography, spacing, radius } from '@theme';
import { formatGoalPercent } from '@shared/utils/calories';

interface Props {
  label: string;
  current: number;
  goal: number | null;
  unit?: string;
  color: string;
}

export function MacroCard({ label, current, goal, unit = 'g', color }: Props): React.JSX.Element {
  const { width, fontScale } = useWindowDimensions();
  const stack = Math.min(width - spacing.lg * 2, 760) / fontScale < 300;
  // goal === null: ainda não há dieta gerada. Mostrar "Meta 0g" seria só
  // trocar uma mentira por outra — o card diz que a meta não existe ainda.
  const hasGoal = goal !== null && goal > 0;
  const pct = hasGoal ? Math.min(Math.max(current / goal, 0), 1) : 0;
  const pctLabel = formatGoalPercent(current, goal);

  return (
    <View testID={`macro-card-${label}`} style={[styles.container, stack && styles.stacked]}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        {hasGoal ? <Text style={[styles.percent, { color }]}>{pctLabel}</Text> : null}
      </View>
      {/* Registro antigo de 999.999 g estourava a largura do card. */}
      <Text style={[styles.value, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {current.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
        {unit}
      </Text>
      <Text style={styles.goal}>{hasGoal ? `Meta ${goal}${unit}` : 'Sem meta'}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%` as const, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minWidth: 94,
    flex: 1,
    // 4 cards (com Fibras): 140 dá 2×2 no telefone (~358 px úteis) e 4 lado a
    // lado no tablet. Com 94, o 4º card caía sozinho numa linha inteira.
    flexBasis: 140,
    backgroundColor: colors.brandSurface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    padding: spacing.md,
  },
  stacked: { flexBasis: '100%' },
  header: {
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  label: {
    flex: 1,
    fontSize: typography.fontSize.xs,
    color: colors.brandTextMuted,
    fontFamily: typography.fontFamily.semiBold,
  },
  percent: { fontSize: typography.fontSize.xs, fontFamily: typography.fontFamily.bold },
  value: {
    fontSize: typography.fontSize.lg,
    fontFamily: typography.fontFamily.extraBold,
    marginTop: 10,
  },
  goal: {
    fontSize: typography.fontSize.xs,
    color: colors.brandTextMuted,
    marginTop: 2,
    marginBottom: spacing.md,
  },
  track: {
    height: 6,
    backgroundColor: colors.brandTrack,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: radius.pill },
});
