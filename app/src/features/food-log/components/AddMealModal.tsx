import React, { useState } from 'react';
import {
  Alert,
  DimensionValue,
  Modal,
  View,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Text, Button } from '@shared/components';
import { colors, typography, spacing } from '@theme';
import { AddMealPayload } from '@shared/services/food-log.service';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: AddMealPayload) => Promise<void>;
}

const saveMealLabel = 'Salvar refeição';
const sheetMaxHeight: DimensionValue = '80%';

export function AddMealModal({ visible, onClose, onSubmit }: Props): React.JSX.Element {
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!name.trim() || !calories) return;
    setLoading(true);
    try {
      await onSubmit({ name: name.trim(), calories: Number(calories), protein: Number(protein) || 0, carbs: Number(carbs) || 0, fat: Number(fat) || 0 });
      setName(''); setCalories(''); setProtein(''); setCarbs(''); setFat('');
      onClose();
    } catch {
      Alert.alert('Nao foi possivel salvar a refeicao', 'Tente novamente em instantes.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Registrar refeição</Text>
            <TouchableOpacity onPress={onClose}><Text style={styles.closeBtn}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <TextInput style={styles.input} placeholder="Nome da refeição" placeholderTextColor={colors.textDisabled} value={name} onChangeText={setName} testID="meal-name-input" />
            <TextInput style={styles.input} placeholder="Calorias (kcal)" placeholderTextColor={colors.textDisabled} keyboardType="numeric" value={calories} onChangeText={setCalories} testID="meal-calories-input" />
            <View style={styles.row}>
              <TextInput style={[styles.input, styles.inputHalf]} placeholder="Proteína (g)" placeholderTextColor={colors.textDisabled} keyboardType="numeric" value={protein} onChangeText={setProtein} />
              <TextInput style={[styles.input, styles.inputHalf]} placeholder="Carbs (g)" placeholderTextColor={colors.textDisabled} keyboardType="numeric" value={carbs} onChangeText={setCarbs} />
            </View>
            <TextInput style={styles.input} placeholder="Gordura (g)" placeholderTextColor={colors.textDisabled} keyboardType="numeric" value={fat} onChangeText={setFat} />
            <Button onPress={handleSubmit} loading={loading} style={styles.submitBtn} labelStyle={styles.submitBtnLabel}>
              {saveMealLabel}
            </Button>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.brandBackground, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.xl, paddingBottom: 40, maxHeight: sheetMaxHeight },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xl },
  headerTitle: { fontSize: typography.fontSize.md, fontFamily: typography.fontFamily.bold, color: colors.brandAnchor },
  closeBtn: { fontSize: 18, color: colors.brandAnchor, padding: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.brandDivider, borderRadius: 10, padding: spacing.md, fontSize: typography.fontSize.base, color: colors.brandAnchor, marginBottom: spacing.md, fontFamily: typography.fontFamily.regular, backgroundColor: colors.brandSurface },
  row: { flexDirection: 'row', gap: 10 },
  inputHalf: { flex: 1 },
  submitBtn: { backgroundColor: colors.brandPrimary, marginTop: spacing.sm },
  submitBtnLabel: { color: colors.brandAnchor },
});
