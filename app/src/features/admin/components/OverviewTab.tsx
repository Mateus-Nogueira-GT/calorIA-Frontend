import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ErrorState, Text } from '@shared/components';
import { adminService, AdminOverview, AdminPeriod } from '@shared/services/admin.service';
import { formatCredits } from '@shared/services/credits.service';
import { colors, radius, spacing } from '@theme';
import { formatInt, formatUsd } from '../format';
import { MetricCard } from './MetricCard';
import { useGridWidth } from './useGridWidth';

const PERIODS: AdminPeriod[] = [7, 30, 90];
const FEATURE_LABELS: Record<string, string> = {
  chat: 'Coach (texto)',
  vision: 'Fotos',
  diet_day: 'Geração de dieta',
  transcribe: 'Transcrição de voz',
  speech: 'Resposta em áudio',
};

export function PeriodSelector({
  value,
  onChange,
}: {
  value: AdminPeriod;
  onChange: (days: AdminPeriod) => void;
}): React.JSX.Element {
  return (
    <View style={styles.periods} accessibilityRole="radiogroup">
      {PERIODS.map((days) => (
        <Pressable
          key={days}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === days }}
          accessibilityLabel={`Últimos ${days} dias`}
          onPress={() => onChange(days)}
          style={[styles.period, value === days && styles.periodSelected]}
        >
          <Text style={value === days ? styles.periodTextSelected : undefined}>{days} dias</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function OverviewTab(): React.JSX.Element {
  const [days, setDays] = useState<AdminPeriod>(30);
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState(false);
  const version = useRef(0);
  const { itemWidth } = useGridWidth();

  const load = useCallback(async (period: AdminPeriod) => {
    const current = ++version.current;
    setError(false);
    setData(null);
    try {
      const overview = await adminService.overview(period);
      if (current === version.current) setData(overview);
    } catch {
      if (current === version.current) setError(true);
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  const cards = (
    title: string,
    items: {
      label: string;
      value: string;
      compare?: { value: number; previous: number };
      hint?: string;
    }[],
  ) => (
    <View style={styles.section}>
      <Text variant="heading3">{title}</Text>
      <View style={styles.grid}>
        {items.map((item) => (
          <MetricCard key={item.label} {...item} width={itemWidth} />
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <PeriodSelector value={days} onChange={setDays} />
      {error && (
        <ErrorState title="Não foi possível carregar as métricas" onRetry={() => void load(days)} />
      )}
      {!data && !error && <Text>Carregando métricas…</Text>}
      {data && (
        <>
          {cards('Usuários', [
            { label: 'Contas', value: formatInt(data.users.total) },
            {
              label: 'Novas contas',
              value: formatInt(data.users.newInPeriod.value),
              compare: data.users.newInPeriod,
            },
            {
              label: 'Ativas no período',
              value: formatInt(data.users.activeInPeriod.value),
              compare: data.users.activeInPeriod,
            },
            { label: 'Ativas nos últimos 7 dias', value: formatInt(data.users.active7d) },
            { label: 'Com dieta ativa', value: formatInt(data.users.withActiveDiet) },
          ])}
          {cards('Uso', [
            {
              label: 'Fotos analisadas',
              value: formatInt(data.usage.photos.value),
              compare: data.usage.photos,
            },
            {
              label: 'Mensagens de texto',
              value: formatInt(data.usage.textMessages.value),
              compare: data.usage.textMessages,
              hint: 'Estimado: mensagens ao Coach menos as de voz',
            },
            {
              label: 'Mensagens de voz',
              value: formatInt(data.usage.voiceMessages.value),
              compare: data.usage.voiceMessages,
            },
            {
              label: 'Refeições registradas',
              value: formatInt(data.usage.mealsLogged.value),
              compare: data.usage.mealsLogged,
            },
            {
              label: 'Dietas geradas',
              value: formatInt(data.usage.dietsCompleted.value),
              compare: data.usage.dietsCompleted,
            },
            {
              label: 'Dietas com falha',
              value: formatInt(data.usage.dietsFailed.value),
              compare: data.usage.dietsFailed,
            },
          ])}
          {cards('Créditos', [
            {
              label: 'Boas-vindas automáticas',
              value: `${formatCredits(data.credits.welcomeAutoUnits.value)} créditos`,
              compare: data.credits.welcomeAutoUnits,
            },
            {
              label: 'Boas-vindas por convite',
              value: `${formatCredits(data.credits.welcomeInviteUnits.value)} créditos`,
              compare: data.credits.welcomeInviteUnits,
            },
            {
              label: 'Liberados manualmente',
              value: `${formatCredits(data.credits.manualUnits?.value ?? 0)} créditos`,
              compare: data.credits.manualUnits ?? { value: 0, previous: 0 },
            },
            {
              label: 'Gastos em fotos',
              value: `${formatCredits(data.credits.consumedPhotoUnits.value)} créditos`,
              compare: data.credits.consumedPhotoUnits,
            },
            {
              label: 'Gastos em mensagens',
              value: `${formatCredits(data.credits.consumedMessageUnits.value)} créditos`,
              compare: data.credits.consumedMessageUnits,
            },
            {
              label: 'Saldo em todas as carteiras',
              value: `${formatCredits(data.credits.totalBalanceUnits)} créditos`,
            },
            { label: 'Contas sem saldo', value: formatInt(data.credits.zeroBalanceAccounts) },
          ])}
          {cards('Convites', [
            {
              label: 'Gerados',
              value: formatInt(data.invites.created.value),
              compare: data.invites.created,
            },
            {
              label: 'Resgatados',
              value: formatInt(data.invites.redeemed.value),
              compare: data.invites.redeemed,
            },
            {
              label: 'Taxa de resgate',
              value: `${Math.round(data.invites.redemptionRate * 100)}%`,
              hint: 'Dos gerados no período',
            },
            { label: 'Expirados sem uso', value: formatInt(data.invites.expiredUnused) },
            { label: 'Revogados', value: formatInt(data.invites.revoked) },
          ])}
          {cards('IA (custo estimado)', [
            {
              label: 'Total estimado',
              value: formatUsd(data.ai.totalEstimatedUsd),
              hint: 'A fatura do OpenRouter é o valor oficial',
            },
            ...data.ai.byFeature.map((f) => ({
              label: FEATURE_LABELS[f.feature] ?? f.feature,
              value: f.estimatedUsd === null ? 'sem preço' : formatUsd(f.estimatedUsd),
              hint: `${formatInt(f.calls)} chamadas · ${formatInt(f.totalTokens)} tokens`,
            })),
          ])}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  section: { gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  periods: { flexDirection: 'row', gap: spacing.sm },
  period: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.brandDivider,
  },
  periodSelected: { backgroundColor: colors.brandAnchor, borderColor: colors.brandAnchor },
  periodTextSelected: { color: colors.brandBackground },
});
