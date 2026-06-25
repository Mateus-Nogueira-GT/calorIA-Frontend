import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@theme';
import { Button } from '@shared/components/Button';
import { ScanResultList } from '../components/ScanResultList';
import { useScannerStore } from '../store';

interface Props {
  navigation: {
    navigate: (screen: string, params?: object) => void;
    getParent: () => { goBack: () => void } | undefined;
  };
  route: never;
}

export function ScanResultScreen({ navigation }: Props): React.JSX.Element {
  const items = useScannerStore((s) => s.items);
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
      navigation.navigate('FoodLog');
    } catch {
      /* store já exibe alerta */
    } finally {
      setSaving(false);
    }
  };

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
  content: { padding: 16 },
  empty: {
    fontSize: 14,
    color: colors.brandTextMuted,
    textAlign: 'center',
    marginBottom: 12,
  },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: colors.brandDivider },
});
