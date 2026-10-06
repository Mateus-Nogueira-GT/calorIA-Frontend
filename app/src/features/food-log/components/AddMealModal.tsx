import React, { useState } from 'react';
import {
  DimensionValue,
  KeyboardAvoidingView,
  Modal,
  Platform,
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Text, Button, Input, screenShellStyle } from '@shared/components';
import { colors, typography, spacing, radius } from '@theme';
import { AddMealPayload, AppMealType } from '@shared/services/food-log.service';
import { showAlert } from '@shared/utils/show-alert';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: AddMealPayload) => Promise<void>;
}

const saveMealLabel = 'Salvar refeição';
const sheetMaxHeight: DimensionValue = '80%';

const MEAL_TYPES: { value: AppMealType; label: string }[] = [
  { value: 'breakfast', label: 'Café da manhã' },
  { value: 'lunch', label: 'Almoço' },
  { value: 'snack', label: 'Lanche' },
  { value: 'dinner', label: 'Jantar' },
];

/**
 * D5 da spec: no web o teclado "numeric" não impede letras — Number('abc')
 * virava NaN e o backend rejeitava com erro genérico. Valida antes.
 */
function parseMacro(raw: string): number | null {
  if (raw.trim() === '') return 0;
  const n = Number(raw.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function AddMealModal({ visible, onClose, onSubmit }: Props): React.JSX.Element {
  const [name, setName] = useState('');
  const [mealType, setMealType] = useState<AppMealType>('lunch');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [loading, setLoading] = useState(false);

  const parsed = {
    calories: parseMacro(calories),
    protein: parseMacro(protein),
    carbs: parseMacro(carbs),
    fat: parseMacro(fat),
  };
  const hasInvalidNumber = Object.values(parsed).some((v) => v === null);
  const canSubmit =
    name.trim().length > 0 && calories.trim() !== '' && !hasInvalidNumber && !loading;

  async function handleSubmit() {
    if (!canSubmit) {
      setFieldError(
        hasInvalidNumber ? 'Use apenas números (sem letras) nos campos de macros.' : '',
      );
      return;
    }
    setLoading(true);
    setFieldError('');
    try {
      await onSubmit({
        name: name.trim(),
        mealType,
        calories: parsed.calories ?? 0,
        protein: parsed.protein ?? 0,
        carbs: parsed.carbs ?? 0,
        fat: parsed.fat ?? 0,
      });
      setName('');
      setCalories('');
      setProtein('');
      setCarbs('');
      setFat('');
      setMealType('lunch');
      onClose();
    } catch {
      showAlert('Não foi possível salvar a refeição', 'Tente novamente em instantes.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {/* Sheet ancorado embaixo: sem isso o teclado numérico do iOS cobria os
          campos de macros e o botão de salvar. */}
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Registrar refeição</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeTarget} accessibilityRole="button" accessibilityLabel="Fechar registro de refeição">
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Input
              label="Nome da refeição"
              placeholder="Nome da refeição"
              placeholderTextColor={colors.textDisabled}
              value={name}
              onChangeText={setName}
              testID="meal-name-input"
            />
            <View style={styles.typeRow}>
              {MEAL_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: mealType === t.value }}
                  onPress={() => setMealType(t.value)}
                  style={[styles.typeChip, mealType === t.value && styles.typeChipSelected]}
                  testID={`meal-type-${t.value}`}
                >
                  <Text
                    style={[
                      styles.typeChipText,
                      mealType === t.value && styles.typeChipTextSelected,
                    ]}
                  >
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Input
              label="Calorias (kcal)"
              placeholder="Calorias (kcal)"
              placeholderTextColor={colors.textDisabled}
              keyboardType="numeric"
              value={calories}
              onChangeText={setCalories}
              testID="meal-calories-input"
            />
            <View>
              <Input
                label="Proteína (g)"
                placeholder="Proteína (g)"
                placeholderTextColor={colors.textDisabled}
                keyboardType="numeric"
                value={protein}
                onChangeText={setProtein}
              />
              <Input
                label="Carboidratos (g)"
                placeholder="Carbs (g)"
                placeholderTextColor={colors.textDisabled}
                keyboardType="numeric"
                value={carbs}
                onChangeText={setCarbs}
              />
            </View>
            <Input
              label="Gordura (g)"
              placeholder="Gordura (g)"
              placeholderTextColor={colors.textDisabled}
              keyboardType="numeric"
              value={fat}
              onChangeText={setFat}
            />
            {fieldError ? <Text style={styles.errorText}>{fieldError}</Text> : null}
            <Button
              onPress={handleSubmit}
              loading={loading}
              disabled={!canSubmit}
              style={styles.submitBtn}
              labelStyle={styles.submitBtnLabel}
            >
              {saveMealLabel}
            </Button>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    ...screenShellStyle,
    backgroundColor: colors.brandBackground,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.xl,
    paddingBottom: 40,
    maxHeight: sheetMaxHeight,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  headerTitle: {
    fontSize: typography.fontSize.md,
    fontFamily: typography.fontFamily.bold,
    color: colors.brandAnchor,
  },
  closeTarget: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  closeBtn: { fontSize: 18, color: colors.brandAnchor, padding: spacing.xs },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  typeChip: {
    minHeight: 48,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    backgroundColor: colors.brandSurface,
  },
  typeChipSelected: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  typeChipText: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.brandAnchor,
  },
  typeChipTextSelected: { fontFamily: typography.fontFamily.semiBold },
  errorText: {
    color: colors.error,
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.sm,
    fontFamily: typography.fontFamily.regular,
  },
  submitBtn: { backgroundColor: colors.brandPrimary, marginTop: spacing.sm },
  submitBtnLabel: { color: colors.brandAnchor },
});
