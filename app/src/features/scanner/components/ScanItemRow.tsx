import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, typography, spacing, radius } from '@theme';
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

type DraftState = Record<string, string>;

export function ScanItemRow({ item, onChange, onRemove }: Props): React.JSX.Element {
  const [drafts, setDrafts] = useState<DraftState>(() =>
    Object.fromEntries(NUM_FIELDS.map((f) => [f.key, String(item[f.key] ?? 0)])),
  );

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
        {NUM_FIELDS.map((f) => {
          const draft = drafts[f.key as string] ?? String(item[f.key] ?? 0);
          return (
            <View key={f.key} style={styles.macroField}>
              <Text style={styles.macroLabel}>{f.label}</Text>
              <TextInput
                testID={`scan-item-${f.key}`}
                style={styles.macroInput}
                value={draft}
                keyboardType='numeric'
                onChangeText={(v) => {
                  setDrafts((prev) => ({ ...prev, [f.key]: v }));
                  const parsed = parseFloat(v);
                  onChange(item.id, {
                    [f.key]: isNaN(parsed) ? 0 : parsed,
                  } as Partial<ScanItem>);
                }}
              />
            </View>
          );
        })}
      </View>
      <ConfidenceBadge confidence={item.confidence} />
      {item.uncertain ? (
        <Text style={styles.uncertain} accessibilityRole='text'>
          Estimativa incerta — confira os valores
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 14,
    marginBottom: spacing.md,
    gap: 10,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nameInput: {
    flex: 1,
    fontSize: typography.fontSize.md,
    color: colors.brandAnchor,
    fontFamily: typography.fontFamily.semiBold,
    borderBottomWidth: 1,
    borderBottomColor: colors.brandDivider,
    paddingVertical: spacing.xs,
  },
  remove: { fontSize: typography.fontSize.md, color: colors.brandTextMuted, paddingHorizontal: spacing.xs },
  macrosRow: { flexDirection: 'row', gap: spacing.sm },
  macroField: { flex: 1 },
  macroLabel: { fontSize: typography.fontSize.xs, color: colors.brandTextMuted, marginBottom: 2 },
  macroInput: {
    backgroundColor: colors.brandMutedSurface,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    fontSize: typography.fontSize.base,
    color: colors.brandText,
  },
  uncertain: { fontSize: typography.fontSize.xs, color: colors.warning },
});
