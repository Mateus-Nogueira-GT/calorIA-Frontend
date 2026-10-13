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
  { key: 'calories', label: 'Calorias (kcal)' },
  { key: 'protein', label: 'Proteína (g)' },
  { key: 'carbs', label: 'Carboidratos (g)' },
  { key: 'fat', label: 'Gordura (g)' },
  { key: 'fiber', label: 'Fibra (g)' },
];

type DraftState = Record<string, string>;

/** Linha de leitura: macros por extenso; fibra só quando existe o dado. */
export function macroSummary(item: ScanItem): string {
  const parts = [
    `Proteína ${item.protein}g`,
    `Carboidratos ${item.carbs}g`,
    `Gordura ${item.fat}g`,
  ];
  if (item.fiber != null) parts.push(`Fibra ${item.fiber}g`);
  return parts.join(' · ');
}

/**
 * Campo vazio: macros viram 0 (comportamento de sempre); fibra vira null —
 * "sem dado", não "0 g". Aceita vírgula decimal do teclado pt-BR.
 */
function parseField(key: keyof ScanItem, raw: string): number | null {
  const parsed = parseFloat(raw.replace(',', '.'));
  if (!isNaN(parsed)) return parsed;
  return key === 'fiber' ? null : 0;
}

export function ScanItemRow({ item, onChange, onRemove }: Props): React.JSX.Element {
  // Feedback 2026-10-12: os campos já eram editáveis, mas nada dizia isso.
  // Agora o item aparece em leitura com um botão "Editar" explícito; o item
  // manual (sem nome) já nasce em edição.
  const [editing, setEditing] = useState(item.name.trim() === '');
  const [drafts, setDrafts] = useState<DraftState>(() =>
    Object.fromEntries(
      NUM_FIELDS.map((f) => [f.key, item[f.key] == null ? '' : String(item[f.key])]),
    ),
  );

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        {editing ? (
          <TextInput
            testID='scan-item-name'
            style={styles.nameInput}
            value={item.name}
            placeholder='Nome do alimento'
            placeholderTextColor={colors.brandTextMuted}
            onChangeText={(name) => onChange(item.id, { name })}
          />
        ) : (
          <View style={styles.readInfo}>
            <Text style={styles.readName}>{item.name}</Text>
            <Text style={styles.readMacros}>{macroSummary(item)}</Text>
          </View>
        )}
        {editing ? null : <Text style={styles.readKcal}>{`${item.calories} kcal`}</Text>}
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
      {editing ? (
        <View style={styles.macrosRow}>
          {NUM_FIELDS.map((f) => (
            <View key={f.key} style={styles.macroField}>
              <Text style={styles.macroLabel}>{f.label}</Text>
              <TextInput
                testID={`scan-item-${f.key}`}
                style={styles.macroInput}
                value={drafts[f.key as string] ?? ''}
                keyboardType='numeric'
                onChangeText={(v) => {
                  setDrafts((prev) => ({ ...prev, [f.key]: v }));
                  onChange(item.id, { [f.key]: parseField(f.key, v) } as Partial<ScanItem>);
                }}
              />
            </View>
          ))}
        </View>
      ) : null}
      <Pressable
        onPress={() => setEditing((e) => !e)}
        accessibilityRole='button'
        accessibilityLabel={editing ? 'Concluir edição' : `Editar ${item.name || 'item'}`}
        style={styles.editBtn}
        hitSlop={8}
      >
        <Text style={styles.editLabel}>{editing ? 'Concluir' : 'Editar'}</Text>
      </Pressable>
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
  macrosRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  macroField: { flexGrow: 1, flexBasis: '45%' },
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
  readInfo: { flex: 1 },
  readName: {
    fontSize: typography.fontSize.md,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.brandAnchor,
  },
  readMacros: { fontSize: typography.fontSize.xs, color: colors.brandText, marginTop: 4 },
  readKcal: {
    fontSize: typography.fontSize.md,
    fontFamily: typography.fontFamily.bold,
    color: colors.brandPrimary,
  },
  editBtn: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.brandMutedSurface,
  },
  editLabel: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.brandAnchor,
  },
});
