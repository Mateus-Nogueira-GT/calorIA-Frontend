import React, { useEffect, useState } from 'react';
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
import { AddMealPayload, AppMealType, Meal } from '@shared/services/food-log.service';
import { showAlert } from '@shared/utils/show-alert';
import { getMealGroupFor } from '@shared/utils/date';
import type { DayTotals } from '@shared/utils/calories';
import {
  checkAgainstGoals,
  GoalWarning,
  MEAL_LIMITS,
  MealField,
  MealGoals,
  mealLimitMessage,
} from '../meal-limits';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: AddMealPayload) => Promise<void>;
  /** Modo edição: abre preenchido com esta refeição. */
  initialMeal?: Meal;
  /** Metas do dia; sem elas (sem dieta) não há aviso de exagero. */
  goals?: MealGoals;
  /** O que já foi consumido no dia (inclui a refeição em edição, se houver). */
  dayTotals?: DayTotals;
}

const saveMealLabel = 'Salvar refeição';
const saveChangesLabel = 'Salvar alterações';
const reviewLabel = 'Revisar valores';
const saveAnywayLabel = 'Salvar mesmo assim';
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

/** Fibra: campo vazio = sem dado (null), diferente dos macros (vazio = 0). */
function parseFiber(raw: string): number | null | undefined {
  if (raw.trim() === '') return null;
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : undefined; // undefined = inválido
}

const toField = (v: number | null | undefined) => (v == null ? '' : String(v));
const GROUP_TO_TYPE: Record<string, AppMealType> = {
  'Café da manhã': 'breakfast',
  Almoço: 'lunch',
  Lanche: 'snack',
  Jantar: 'dinner',
};

/**
 * Refeição sem tipo ('other' — tudo que vem do scanner e registros antigos)
 * aparece no diário pelo horário. Na edição, o tipo pré-selecionado é esse
 * mesmo grupo; com 'lunch' fixo, salvar só as calorias de um jantar o movia
 * para "Almoço".
 */
function initialType(meal?: Meal): AppMealType {
  if (!meal) return 'lunch';
  if (meal.mealType !== 'other') return meal.mealType;
  return GROUP_TO_TYPE[getMealGroupFor(meal.mealType, meal.loggedAt)] ?? 'lunch';
}

const fmt = (n: number) => n.toLocaleString('pt-BR');

export function AddMealModal({
  visible,
  onClose,
  onSubmit,
  initialMeal,
  goals,
  dayTotals,
}: Props): React.JSX.Element {
  const [name, setName] = useState(initialMeal?.name ?? '');
  const [mealType, setMealType] = useState<AppMealType>(initialType(initialMeal));
  const [calories, setCalories] = useState(toField(initialMeal?.calories));
  const [protein, setProtein] = useState(toField(initialMeal?.protein));
  const [carbs, setCarbs] = useState(toField(initialMeal?.carbs));
  const [fat, setFat] = useState(toField(initialMeal?.fat));
  const [fiber, setFiber] = useState(toField(initialMeal?.fiber));
  const [fieldError, setFieldError] = useState('');
  const [loading, setLoading] = useState(false);
  const [goalWarning, setGoalWarning] = useState<GoalWarning | null>(null);

  const parsed = {
    calories: parseMacro(calories),
    protein: parseMacro(protein),
    carbs: parseMacro(carbs),
    fat: parseMacro(fat),
  };
  const parsedFiber = parseFiber(fiber);
  const overLimit = (field: MealField, value: number | null | undefined) =>
    value != null && value > MEAL_LIMITS[field] ? mealLimitMessage(field) : undefined;
  const limitErrors = {
    calories: overLimit('calories', parsed.calories),
    protein: overLimit('protein', parsed.protein),
    carbs: overLimit('carbs', parsed.carbs),
    fat: overLimit('fat', parsed.fat),
    fiber: overLimit('fiber', parsedFiber),
  };
  const hasInvalidNumber =
    Object.values(parsed).some((v) => v === null) ||
    parsedFiber === undefined ||
    Object.values(limitErrors).some(Boolean);

  // O mesmo modal serve para registrar e editar: ao abrir para outra refeição,
  // os campos têm que refletir ESSA refeição, não o que ficou da anterior.
  useEffect(() => {
    if (!visible) return;
    setName(initialMeal?.name ?? '');
    setMealType(initialType(initialMeal));
    setCalories(toField(initialMeal?.calories));
    setProtein(toField(initialMeal?.protein));
    setCarbs(toField(initialMeal?.carbs));
    setFat(toField(initialMeal?.fat));
    setFiber(toField(initialMeal?.fiber));
    setFieldError('');
    setGoalWarning(null);
  }, [visible, initialMeal]);
  const canSubmit =
    name.trim().length > 0 && calories.trim() !== '' && !hasInvalidNumber && !loading;

  async function handleSubmit(confirmed = false) {
    if (!canSubmit) {
      const onlyLimits = Object.values(parsed).every((v) => v !== null) && parsedFiber !== undefined;
      setFieldError(
        hasInvalidNumber && !onlyLimits ? 'Use apenas números (sem letras) nos campos de macros.' : '',
      );
      return;
    }
    if (!confirmed && goals) {
      const meal = {
        calories: parsed.calories ?? 0,
        protein: parsed.protein ?? 0,
        carbs: parsed.carbs ?? 0,
        fat: parsed.fat ?? 0,
      };
      // Na edição a refeição já está somada no dia: desconta antes de somar a nova.
      const dayBefore = { calories: (dayTotals?.calories ?? 0) - (initialMeal?.calories ?? 0) };
      const warning = checkAgainstGoals(meal, dayBefore, goals);
      if (warning) {
        setGoalWarning(warning);
        return;
      }
    }
    setGoalWarning(null);
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
        fiber: parsedFiber ?? null,
      });
      setName('');
      setCalories('');
      setProtein('');
      setCarbs('');
      setFat('');
      setFiber('');
      setMealType('lunch');
      onClose();
    } catch {
      showAlert('Não foi possível salvar a refeição', 'Tente novamente em instantes.');
    } finally {
      setLoading(false);
    }
  }

  // Botões chamam com argumento explícito: o onPress passaria o evento como `confirmed`.
  const submit = () => handleSubmit(false);
  const confirmSave = () => handleSubmit(true);

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
            <Text style={styles.headerTitle}>
              {initialMeal ? 'Editar refeição' : 'Registrar refeição'}
            </Text>
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
              error={limitErrors.calories}
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
                error={limitErrors.protein}
              />
              <Input
                label="Carboidratos (g)"
                placeholder="Carbs (g)"
                placeholderTextColor={colors.textDisabled}
                keyboardType="numeric"
                value={carbs}
                onChangeText={setCarbs}
                error={limitErrors.carbs}
              />
            </View>
            <Input
              label="Gordura (g)"
              placeholder="Gordura (g)"
              placeholderTextColor={colors.textDisabled}
              keyboardType="numeric"
              value={fat}
              onChangeText={setFat}
              error={limitErrors.fat}
            />
            <Input
              label="Fibra (g)"
              placeholder="Fibra (g) — opcional"
              placeholderTextColor={colors.textDisabled}
              keyboardType="numeric"
              value={fiber}
              onChangeText={setFiber}
              error={limitErrors.fiber}
              testID="meal-fiber-input"
            />
            {fieldError ? <Text style={styles.errorText}>{fieldError}</Text> : null}
            {goalWarning ? (
              <View style={styles.warning} accessibilityLiveRegion="polite">
                <Text style={styles.warningTitle}>Essa refeição está bem acima da sua meta</Text>
                <Text style={styles.warningBody}>
                  Com ela, você chega a {fmt(goalWarning.dayCalories)} kcal hoje (
                  {goalWarning.dayPercent}% da meta de {fmt(goalWarning.calorieGoal)} kcal). Confira
                  se os valores estão certos.
                </Text>
                <Button
                  onPress={() => setGoalWarning(null)}
                  style={styles.reviewBtn}
                  labelStyle={styles.submitBtnLabel}
                >
                  {reviewLabel}
                </Button>
                <Button
                  onPress={confirmSave}
                  loading={loading}
                  style={styles.submitBtn}
                  labelStyle={styles.submitBtnLabel}
                >
                  {saveAnywayLabel}
                </Button>
              </View>
            ) : null}
            <Button
              onPress={submit}
              loading={loading}
              disabled={!canSubmit}
              style={styles.submitBtn}
              labelStyle={styles.submitBtnLabel}
            >
              {initialMeal ? saveChangesLabel : saveMealLabel}
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
  warning: {
    backgroundColor: colors.brandSurface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.error,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  warningTitle: {
    fontSize: typography.fontSize.md,
    fontFamily: typography.fontFamily.bold,
    color: colors.brandAnchor,
    marginBottom: spacing.xs,
  },
  warningBody: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.brandAnchor,
  },
  reviewBtn: {
    backgroundColor: colors.brandSurface,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    marginTop: spacing.md,
  },
  submitBtnLabel: { color: colors.brandAnchor },
});
