import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';
import { useFoodLog } from '../hooks/useFoodLog';
import { DateChip } from '../components/DateChip';
import { DayMacroSummary } from '../components/DayMacroSummary';
import { MealSection } from '../components/MealSection';
import { AddMealModal } from '../components/AddMealModal';
import { last7Days, formatChipLabel, getMealGroup } from '@shared/utils/date';

const GROUPS = ['Café da manhã', 'Almoço', 'Lanche', 'Jantar'] as const;

export function FoodLogScreen(): React.JSX.Element {
  const { meals, isLoading, selectedDate, setSelectedDate, handleAddMeal, handleDeleteMeal } = useFoodLog();
  const [modalVisible, setModalVisible] = useState(false);
  const dates = last7Days();

  const grouped = GROUPS.reduce<Record<string, typeof meals>>((acc, g) => {
    acc[g] = meals.filter((m) => getMealGroup(m.loggedAt) === g);
    return acc;
  }, {});

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Diário alimentar</Text>
        <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ Adicionar</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={styles.chipsContent}>
        {dates.map((d) => (
          <DateChip key={d} label={formatChipLabel(d)} selected={d === selectedDate} onPress={() => setSelectedDate(d)} />
        ))}
      </ScrollView>

      {isLoading ? (
        <View style={styles.center}>
          <Text style={styles.loadingText}>Carregando...</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <DayMacroSummary meals={meals} />
          <View style={styles.sections}>
            {GROUPS.map((g) => (
              <MealSection key={g} title={g} meals={grouped[g] ?? []} onDelete={handleDeleteMeal} />
            ))}
          </View>
          {meals.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Nenhuma refeição registrada neste dia.</Text>
            </View>
          )}
        </ScrollView>
      )}

      <AddMealModal visible={modalVisible} onClose={() => setModalVisible(false)} onSubmit={handleAddMeal} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 56 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: typography.fontSize.xl, fontFamily: typography.fontFamily.bold, color: colors.textPrimary },
  addBtn: { backgroundColor: colors.primary, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14 },
  addBtnText: { fontSize: typography.fontSize.sm, fontFamily: typography.fontFamily.semiBold, color: colors.white },
  chips: { maxHeight: 44, marginBottom: 4 },
  chipsContent: { paddingHorizontal: 16 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 8 },
  sections: { marginTop: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: colors.textSecondary },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyText: { color: colors.textSecondary, fontSize: typography.fontSize.sm },
});
