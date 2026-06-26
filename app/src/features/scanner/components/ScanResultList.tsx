import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '@theme';
import { ScanItemRow } from './ScanItemRow';
import type { ScanItem } from '@shared/services/scanner.service';

interface Props {
  items: ScanItem[];
  onChange: (id: string, patch: Partial<ScanItem>) => void;
  onRemove: (id: string) => void;
  onAddManual: () => void;
}

export function ScanResultList({ items, onChange, onRemove, onAddManual }: Props): React.JSX.Element {
  const totalKcal = items.reduce((acc, i) => acc + (i.calories || 0), 0);
  return (
    <View>
      {items.map((i) => (
        <ScanItemRow key={i.id} item={i} onChange={onChange} onRemove={onRemove} />
      ))}
      <Pressable onPress={onAddManual} style={styles.add} accessibilityRole='button'>
        <Text style={styles.addText}>＋ Adicionar item</Text>
      </Pressable>
      <Text style={styles.total}>Total: {totalKcal} kcal</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  add: { paddingVertical: 12, alignItems: 'center' },
  addText: {
    fontSize: 14,
    color: colors.brandPrimary,
    fontFamily: typography.fontFamily.semiBold,
  },
  total: {
    fontSize: 15,
    color: colors.brandAnchor,
    fontFamily: typography.fontFamily.bold,
    textAlign: 'right',
    marginTop: 4,
  },
});
