import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing } from '@theme';
import { Button, ErrorState } from '@shared/components';
import { ScanResultList } from '../components/ScanResultList';
import { useScannerStore } from '../store';
import type { ScannerStackScreenProps } from '@navigation/types';

type Props = ScannerStackScreenProps<'ScanResult'>;

export function ScanResultScreen({ navigation }: Props): React.JSX.Element {
  const items = useScannerStore((s) => s.items);
  const error = useScannerStore((s) => s.error);
  const updateItem = useScannerStore((s) => s.updateItem);
  const removeItem = useScannerStore((s) => s.removeItem);
  const addManualItem = useScannerStore((s) => s.addManualItem);
  const confirm = useScannerStore((s) => s.confirm);
  const [saving, setSaving] = useState(false);

  const onConfirm = async () => {
    setSaving(true);
    try {
      await confirm();
      navigation.getParent()?.goBack();
    } catch {
      /* store já exibe alerta */
    } finally {
      setSaving(false);
    }
  };

  if (error && items.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ErrorState
          title="Não foi possível analisar a foto"
          subtitle={error}
          onRetry={() => navigation.getParent()?.goBack()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {items.length === 0 ? (
          <Text style={styles.empty}>Não detectei alimentos. Adicione manualmente.</Text>
        ) : null}
        <ScanResultList
          items={items}
          onChange={updateItem}
          onRemove={removeItem}
          onAddManual={addManualItem}
        />
      </ScrollView>
      <View style={styles.footer}>
        <Button onPress={onConfirm} loading={saving} disabled={items.length === 0}>
          Confirmar e adicionar ao diário
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brandBackground },
  content: { padding: spacing.lg },
  empty: {
    fontSize: typography.fontSize.base,
    color: colors.brandTextMuted,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.brandDivider },
});
