import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, typography, spacing, radius } from '@theme';
import {
  isValidScanWeight,
  roundScanAmount,
  scaleScanPortion,
  scanItemProblem,
} from '@shared/utils/scan-portion';
import { ConfidenceBadge } from './ConfidenceBadge';
import type { ScanItem } from '@shared/services/scanner.service';

interface Props {
  item: ScanItem;
  onChange: (id: string, patch: Partial<ScanItem>) => void;
  onRemove: (id: string) => void;
  /** 05/11: troca pelo alimento alternativo `index`. */
  onChooseAlternative?: (id: string, index: number) => void;
}

/** Abaixo disto, item com alternativas pede para conferir o alimento. */
const CHECK_FOOD_BELOW = 0.6;

const NUM_FIELDS: { key: keyof ScanItem; label: string }[] = [
  { key: 'weightGrams', label: 'Peso (g)' },
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
    `Proteína ${roundScanAmount(item.protein)}g`,
    `Carboidratos ${roundScanAmount(item.carbs)}g`,
    `Gordura ${roundScanAmount(item.fat)}g`,
  ];
  if (item.fiber != null) parts.push(`Fibra ${roundScanAmount(item.fiber)}g`);
  return parts.join(' · ');
}

/**
 * Campo vazio: macros viram 0 (comportamento de sempre); fibra vira null —
 * "sem dado", não "0 g". Aceita vírgula decimal do teclado pt-BR. Fibra com
 * letras devolve undefined: não altera o valor (não vira "sem dado" calado).
 */
function parseField(key: keyof ScanItem, raw: string): number | null | undefined {
  if (key === 'weightGrams') {
    const parsedWeight = Number(raw.trim().replace(',', '.'));
    return isValidScanWeight(parsedWeight) ? parsedWeight : 0;
  }
  const parsed = parseFloat(raw.replace(',', '.'));
  if (!isNaN(parsed)) return parsed;
  if (key !== 'fiber') return 0;
  return raw.trim() === '' ? null : undefined;
}

function draftsFrom(item: ScanItem): DraftState {
  return Object.fromEntries(
    NUM_FIELDS.map((f) => [f.key, item[f.key] == null ? '' : String(item[f.key])]),
  );
}

export function ScanItemRow({
  item,
  onChange,
  onRemove,
  onChooseAlternative,
}: Props): React.JSX.Element {
  // Feedback 2026-10-12: os campos já eram editáveis, mas nada dizia isso.
  // Agora o item aparece em leitura com um botão "Editar" explícito; o item
  // manual (sem nome) já nasce em edição.
  const [weightTouched, setWeightTouched] = useState(false);
  const [editing, setEditing] = useState(item.name.trim() === '');
  const [drafts, setDrafts] = useState<DraftState>(() => draftsFrom(item));
  const alternatives = item.alternatives ?? [];
  // 05/11: renomear "Carne suína" para "Salmão" deixava os valores da carne.
  const staleValues =
    item.valuesFrom != null && item.name.trim() !== '' && item.name.trim() !== item.valuesFrom;

  const weightError =
    (weightTouched || item.weightGrams != null) &&
    !isValidScanWeight(Number(drafts.weightGrams?.replace(',', '.')));
  // Valor impossível (ex.: 999.999 kcal): não exibe o número, mostra o erro.
  const valuesError = scanItemProblem(item);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        {editing ? (
          <TextInput
            testID="scan-item-name"
            style={styles.nameInput}
            value={item.name}
            placeholder="Nome do alimento"
            placeholderTextColor={colors.brandTextMuted}
            onChangeText={(name) => onChange(item.id, { name })}
          />
        ) : (
          <View style={styles.readInfo}>
            <Text style={styles.readName}>{item.name}</Text>
            <Text style={styles.readWeight}>
              {item.weightGrams == null
                ? 'Peso não informado'
                : `Peso estimado: ${roundScanAmount(item.weightGrams)} g`}
            </Text>
            {valuesError ? null : <Text style={styles.readMacros}>{macroSummary(item)}</Text>}
          </View>
        )}
        {editing || valuesError ? null : (
          <Text style={styles.readKcal}>{`${roundScanAmount(item.calories)} kcal`}</Text>
        )}
        <Pressable
          testID="scan-item-remove"
          onPress={() => onRemove(item.id)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Remover"
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
                accessibilityLabel={f.label}
                keyboardType="numeric"
                onChangeText={(v) => {
                  setDrafts((prev) => ({ ...prev, [f.key]: v }));
                  if (f.key === 'weightGrams') setWeightTouched(true);
                  const value = parseField(f.key, v);
                  if (
                    f.key === 'weightGrams' &&
                    typeof value === 'number' &&
                    isValidScanWeight(value)
                  ) {
                    const scaled = scaleScanPortion(item, value);
                    setDrafts((prev) => ({
                      ...prev,
                      ...Object.fromEntries(
                        Object.entries(scaled)
                          .filter(([key]) => key !== 'weightGrams')
                          .map(([key, amount]) => [
                            key,
                            typeof amount === 'number' ? String(roundScanAmount(amount)) : '',
                          ]),
                      ),
                    }));
                  }
                  if (value !== undefined) {
                    onChange(item.id, { [f.key]: value } as Partial<ScanItem>);
                  }
                }}
              />
            </View>
          ))}
        </View>
      ) : null}
      {editing && weightError ? (
        <Text style={styles.weightError} accessibilityRole="alert">
          Informe um peso entre 0,1 g e 5.000 g.
        </Text>
      ) : null}
      {valuesError ? (
        <Text style={styles.weightError} accessibilityRole="alert">
          {valuesError}
        </Text>
      ) : null}
      <Pressable
        disabled={editing && weightError}
        onPress={() => {
          // Uma troca de alimento muda os valores: os campos partem do estado atual.
          if (!editing) setDrafts(draftsFrom(item));
          setEditing((e) => !e);
        }}
        accessibilityRole="button"
        accessibilityLabel={editing ? 'Concluir edição' : `Editar ${item.name || 'item'}`}
        style={styles.editBtn}
        hitSlop={8}
      >
        <Text style={styles.editLabel}>{editing ? 'Concluir' : 'Editar'}</Text>
      </Pressable>
      {staleValues ? (
        <Text style={styles.staleValues} accessibilityRole="alert">
          {`Os valores ainda são de "${item.valuesFrom}". Confira${
            alternatives.length ? ' ou toque numa opção abaixo' : ''
          }.`}
        </Text>
      ) : null}
      {alternatives.length > 0 ? (
        <View style={styles.alternatives}>
          <Text style={styles.altLabel}>É outro alimento?</Text>
          <View style={styles.altChips}>
            {alternatives.map((alt, index) => (
              <Pressable
                key={`${alt.name}-${index}`}
                onPress={() => onChooseAlternative?.(item.id, index)}
                accessibilityRole="button"
                accessibilityLabel={`Trocar para ${alt.name}`}
                style={styles.altChip}
                hitSlop={4}
              >
                <Text style={styles.altChipText}>{alt.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      <ConfidenceBadge confidence={item.confidence} />
      {alternatives.length > 0 && item.confidence < CHECK_FOOD_BELOW ? (
        <Text style={styles.uncertain} accessibilityRole="text">
          Confira o alimento
        </Text>
      ) : null}
      {item.uncertain ? (
        <Text style={styles.uncertain} accessibilityRole="text">
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
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 },
  nameInput: {
    flex: 1,
    fontSize: typography.fontSize.md,
    color: colors.brandAnchor,
    fontFamily: typography.fontFamily.semiBold,
    borderBottomWidth: 1,
    borderBottomColor: colors.brandDivider,
    paddingVertical: spacing.xs,
  },
  remove: {
    fontSize: typography.fontSize.md,
    color: colors.brandTextMuted,
    paddingHorizontal: spacing.xs,
  },
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
  staleValues: { fontSize: typography.fontSize.sm, color: colors.warning },
  alternatives: { gap: spacing.xs },
  altLabel: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.brandAnchor,
  },
  altChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  altChip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandDividerStrong,
    backgroundColor: colors.brandSurface,
  },
  altChipText: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.brandAnchor,
  },
  readInfo: { flexGrow: 1, flexBasis: '65%', minWidth: 0 },
  readWeight: {
    fontSize: typography.fontSize.sm,
    color: colors.brandTextMuted,
    marginTop: spacing.xs,
  },
  weightError: { fontSize: typography.fontSize.sm, color: colors.error },
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
