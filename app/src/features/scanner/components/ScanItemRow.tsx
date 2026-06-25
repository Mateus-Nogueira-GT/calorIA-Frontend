import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, typography } from '@theme';
import { ConfidenceBadge } from './ConfidenceBadge';
import type { ScanItem } from '@shared/services/scanner.service';

interface Props {
  item: ScanItem;
  onChange: (id: string, patch: Partial<ScanItem>) => void;
  onRemove: (id: string) => void;
}

const NUM_FIELDS: { key: keyof ScanItem; label: string }[] = [
  { key: 'calories', label: 'kcal' },
  { key: 'protein', label: 'P' },
  { key: 'carbs', label: 'C' },
  { key: 'fat', label: 'G' },
];

export function ScanItemRow({ item, onChange, onRemove }: Props): React.JSX.Element {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <TextInput
          testID='scan-item-name'
          style={styles.nameInput}
          value={item.name}
          placeholder='Nome do alimento'
          placeholderTextColor={colors.brandTextMuted}
          onChangeText={(name) => onChange(item.id, { name })}
        />
        <Pressable
          testID='scan-item-remove'
          onPress={() => onRemove(item.id)}
          hitSlop={8}
          accessibilityRole='button'
          accessibilityLabel='Remover'
        >
          <Text style={styles.remove}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.macrosRow}>
        {NUM_FIELDS.map((f) => (
          <View key={f.key} style={styles.macroField}>
            <Text style={styles.macroLabel}>{f.label}</Text>
            <TextInput
              testID={`scan-item-${f.key}`}
              style={styles.macroInput}
              value={String(item[f.key] ?? 0)}
              keyboardType='numeric'
              onChangeText={(v) =>
                onChange(item.id, { [f.key]: Number(v) || 0 } as Partial<ScanItem>)
              }
            />
          </View>
        ))}
      </View>
      <ConfidenceBadge confidence={item.confidence} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nameInput: {
    flex: 1,
    fontSize: 16,
    color: colors.brandAnchor,
    fontFamily: typography.fontFamily.semiBold,
    borderBottomWidth: 1,
    borderBottomColor: colors.brandDivider,
    paddingVertical: 4,
  },
  remove: { fontSize: 16, color: colors.brandTextMuted, paddingHorizontal: 4 },
  macrosRow: { flexDirection: 'row', gap: 8 },
  macroField: { flex: 1 },
  macroLabel: { fontSize: 11, color: colors.brandTextMuted, marginBottom: 2 },
  macroInput: {
    backgroundColor: colors.brandMutedSurface,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
    color: colors.brandText,
  },
});
