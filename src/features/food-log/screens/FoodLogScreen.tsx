import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';
import { useFoodLog } from '../hooks/useFoodLog';
import { DateChip } from '../components/DateChip';
import { DayMacroSummary } from '../components/DayMacroSummary';
import { MealSection } from '../components/MealSection';
import { AddMealModal } from '../components/AddMealModal';
import { formatChipLabel, getMealGroup, last7Days } from '@shared/utils/date';

const GROUPS = ['Café da manhã', 'Almoço', 'Lanche', 'Jantar'] as const;
const addMealLabel = 'Adicionar refeição';
const emptyTitle = 'Nenhuma refeição registrada neste dia.';
const emptySubtitle = 'Registre sua primeira refeição para acompanhar o consumo diário.';

function AddMealGlyph(): React.JSX.Element {
  return (
    <View style={styles.addGlyph}>
      <View style={styles.addGlyphVertical} />
      <View style={styles.addGlyphHorizontal} />
    </View>
  );
}

function DiaryEmptyIcon(): React.JSX.Element {
  return (
    <View style={styles.emptyIcon}>
      <View style={styles.emptyIconSpine} />
      <View style={styles.emptyIconPage} />
      <View style={styles.emptyIconLineShort} />
      <View style={styles.emptyIconLineLong} />
    </View>
  );
}

export function FoodLogScreen(): React.JSX.Element {
  const { meals, isLoading, selectedDate, setSelectedDate, handleAddMeal, handleDeleteMeal } = useFoodLog();
  const [modalVisible, setModalVisible] = useState(false);
  const dates = last7Days();

  const grouped = useMemo(
    () =>
      GROUPS.reduce<Record<string, typeof meals>>((acc, group) => {
        acc[group] = meals.filter((meal) => getMealGroup(meal.loggedAt) === group);
        return acc;
      }, {}),
    [meals],
  );

  function openAddMealFlow() {
    setModalVisible(true);
  }

  return (
    <View style={styles.container}>
      <View style={styles.shell}>
        <View style={styles.header}>
          <Text style={styles.title}>Diário alimentar</Text>
          <TouchableOpacity onPress={openAddMealFlow} style={styles.addBtn} accessibilityRole='button' testID='food-log-add-button'>
            <AddMealGlyph />
            <Text style={styles.addBtnText}>{addMealLabel}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chips}
          contentContainerStyle={styles.chipsContent}
        >
          {dates.map((date) => (
            <DateChip
              key={date}
              label={formatChipLabel(date)}
              selected={date === selectedDate}
              onPress={() => setSelectedDate(date)}
            />
          ))}
        </ScrollView>

        {isLoading ? (
          <View style={styles.center}>
            <Text style={styles.loadingText}>Carregando refeições...</Text>
          </View>
        ) : (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <DayMacroSummary meals={meals} />
            {meals.length === 0 ? (
              <View style={styles.emptyState}>
                <DiaryEmptyIcon />
                <Text style={styles.emptyTitle}>{emptyTitle}</Text>
                <Text style={styles.emptySubtitle}>{emptySubtitle}</Text>
                <TouchableOpacity onPress={openAddMealFlow} style={styles.emptyCta} accessibilityRole='button'>
                  <AddMealGlyph />
                  <Text style={styles.emptyCtaText}>{addMealLabel}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.sections}>
                {GROUPS.map((group) => (
                  <MealSection key={group} title={group} meals={grouped[group] ?? []} onDelete={handleDeleteMeal} />
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </View>

      <AddMealModal visible={modalVisible} onClose={() => setModalVisible(false)} onSubmit={handleAddMeal} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.brandBackground, paddingTop: 56 },
  shell: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    flexWrap: 'wrap',
  },
  title: {
    fontSize: typography.fontSize.xl,
    fontFamily: typography.fontFamily.bold,
    color: colors.brandAnchor,
  },
  addBtn: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.brandPrimary,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  addBtnText: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.brandAnchor,
  },
  addGlyph: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addGlyphVertical: {
    position: 'absolute',
    width: 2,
    height: 12,
    borderRadius: 999,
    backgroundColor: colors.brandAnchor,
  },
  addGlyphHorizontal: {
    width: 12,
    height: 2,
    borderRadius: 999,
    backgroundColor: colors.brandAnchor,
  },
  chips: { maxHeight: 58 },
  chipsContent: { paddingHorizontal: 16, paddingVertical: 4 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 110 },
  sections: { marginTop: 18 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: colors.brandTextMuted, fontSize: typography.fontSize.sm },
  emptyState: {
    minHeight: 360,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 32,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.brandDividerStrong,
    backgroundColor: colors.brandSurface,
    marginBottom: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyIconSpine: {
    position: 'absolute',
    left: 12,
    top: 10,
    bottom: 10,
    width: 4,
    borderRadius: 999,
    backgroundColor: colors.brandAnchor,
  },
  emptyIconPage: {
    width: 24,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.brandDividerStrong,
    backgroundColor: colors.brandMutedSurface,
    marginLeft: 8,
  },
  emptyIconLineShort: {
    position: 'absolute',
    right: 12,
    top: 18,
    width: 10,
    height: 2,
    borderRadius: 999,
    backgroundColor: colors.brandAnchor,
  },
  emptyIconLineLong: {
    position: 'absolute',
    right: 12,
    top: 26,
    width: 14,
    height: 2,
    borderRadius: 999,
    backgroundColor: colors.brandTextMuted,
  },
  emptyTitle: {
    fontSize: typography.fontSize.md,
    fontFamily: typography.fontFamily.bold,
    color: colors.brandAnchor,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.brandTextMuted,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 320,
  },
  emptyCta: {
    marginTop: 18,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    backgroundColor: colors.brandPrimary,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  emptyCtaText: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.brandAnchor,
  },
});
