import React, { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Text, screenShellStyle } from '@shared/components';
import { creditsService, formatCredits, LedgerEntry } from '@shared/services/credits.service';
import { useAuthStore } from '@features/auth/store';
import { colors, spacing } from '@theme';
import { useCreditsStore } from '../store';
import { PendingOperations } from '../components/PendingOperations';

const buttonLabels = {
  more: 'Ver mais',
  reloadHistory: 'Recarregar extrato',
  retry: 'Tentar novamente',
} as const;

export function CreditsScreen(): React.JSX.Element {
  const { wallet, loading, error, load } = useCreditsStore();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const insets = useSafeAreaInsets();
  const generation = useAuthStore((state) => state.sessionGeneration);
  const historyVersion = useRef(0);
  const active = useRef(false);
  const readHistory = useCallback(async (next?: string) => {
    const generation = useAuthStore.getState().sessionGeneration;
    const version = ++historyVersion.current;
    const isCurrent = () =>
      active.current &&
      version === historyVersion.current &&
      generation === useAuthStore.getState().sessionGeneration;
    setHistoryLoading(true);
    try {
      const page = await creditsService.ledger(next);
      if (!isCurrent()) return;
      setEntries((old) => (next ? [...old, ...page.items] : page.items));
      setCursor(page.next_cursor);
      setHistoryError(null);
    } catch {
      if (isCurrent()) setHistoryError('Não foi possível carregar o extrato.');
    } finally {
      if (isCurrent()) setHistoryLoading(false);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      if (generation !== useAuthStore.getState().sessionGeneration) return;
      active.current = true;
      setEntries([]);
      setCursor(null);
      setHistoryError(null);
      void load();
      void readHistory();
      return () => {
        active.current = false;
        historyVersion.current++;
      };
    }, [load, readHistory, generation]),
  );
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
    >
      {loading && <Text>Consultando saldo…</Text>}
      {error && (
        <>
          <Text accessibilityRole="alert">{error}</Text>
          <Button onPress={load}>{buttonLabels.retry}</Button>
        </>
      )}
      {wallet && (
        <>
          <Text
            variant="heading2"
            accessibilityLabel={`${formatCredits(wallet.available_units)} créditos disponíveis`}
          >
            {formatCredits(wallet.available_units)} créditos disponíveis
          </Text>
          {wallet.reserved_units > 0 && (
            <Text>
              {formatCredits(wallet.reserved_units)} em processamento. O saldo será atualizado ao
              concluir.
            </Text>
          )}
          {wallet.enforcement_enabled ? (
            <Text>
              Foto: 3 créditos. Cada 5 mensagens, contando você e o coach: 1 crédito (0,2 por
              mensagem).
            </Text>
          ) : (
            <Text>A cobrança por créditos ainda não está ativa.</Text>
          )}
        </>
      )}
      <PendingOperations />
      <Text variant="heading3">Extrato</Text>
      {historyLoading && <Text>Carregando extrato…</Text>}
      {historyError && (
        <>
          <Text accessibilityRole="alert">{historyError}</Text>
          <Button variant="secondary" onPress={() => readHistory()}>
            {buttonLabels.reloadHistory}
          </Button>
        </>
      )}
      {!historyLoading && !historyError && entries.length === 0 && (
        <Text>Nenhuma movimentação por enquanto.</Text>
      )}
      {entries.map((entry) => (
        <View key={entry.id} style={styles.entry}>
          <Text>{entry.kind === 'welcome' ? 'Créditos de boas-vindas' : 'Uso de IA'}</Text>
          <Text>
            {entry.units > 0 ? '+' : ''}
            {formatCredits(entry.units)} créditos ·{' '}
            {new Date(entry.created_at).toLocaleDateString('pt-BR')}
          </Text>
        </View>
      ))}
      {cursor && (
        <Button variant="secondary" loading={historyLoading} onPress={() => readHistory(cursor)}>
          {buttonLabels.more}
        </Button>
      )}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.brandBackground },
  content: { ...screenShellStyle, padding: spacing.lg, gap: spacing.lg },
  entry: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.brandDivider,
    gap: spacing.xs,
  },
});
