import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@shared/components';
import { colors, radius, spacing, typography } from '@theme';
import { useCoachStore } from '../store';

const generatingLabel = 'Gerando sua dieta';
const failedTitleLabel = 'A geração da dieta falhou';
const failedBodyLabel = 'Sua dieta anterior continua ativa. Podemos continuar de onde parou.';
const retryLabel = 'Tentar novamente';

/**
 * Progresso/erro da geração assíncrona da dieta (B8 da spec).
 * running → barra "dia X de Y"; failed → botão de retry (continua do dia que parou).
 */
export function DietJobBanner(): React.JSX.Element | null {
  const dietJob = useCoachStore((s) => s.dietJob);
  const retryDietGeneration = useCoachStore((s) => s.retryDietGeneration);

  if (!dietJob || dietJob.status === 'completed') return null;

  if (dietJob.status === 'failed') {
    return (
      <View style={[styles.banner, styles.bannerError]} testID="diet-job-banner-failed">
        <Text style={styles.title}>{failedTitleLabel}</Text>
        <Text style={styles.body}>{failedBodyLabel}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => void retryDietGeneration()}
          style={styles.retryBtn}
          testID="diet-job-retry"
        >
          <Text style={styles.retryLabel}>{retryLabel}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const progress = dietJob.totalDays > 0 ? dietJob.daysCompleted / dietJob.totalDays : 0;
  return (
    <View style={styles.banner} testID="diet-job-banner-running">
      <Text style={styles.title}>
        {generatingLabel} — dia {Math.min(dietJob.daysCompleted + 1, dietJob.totalDays)} de{' '}
        {dietJob.totalDays}
      </Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.brandSurface,
    borderWidth: 1,
    borderColor: colors.brandDivider,
  },
  bannerError: {
    borderColor: colors.error,
  },
  title: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.sm,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  body: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.brandDivider,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  retryLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.sm,
    color: '#FFFFFF',
  },
});
