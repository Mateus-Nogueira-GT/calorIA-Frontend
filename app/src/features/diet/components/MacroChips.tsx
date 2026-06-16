import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@shared/components';

interface Props {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export function MacroChips({ kcal, protein, carbs, fat }: Props): React.JSX.Element {
  return (
    <View style={styles.row}>
      <View style={[styles.chip, styles.chipKcal]}>
        <Text style={[styles.chipText, styles.textKcal]}>{kcal} kcal</Text>
      </View>
      <View style={[styles.chip, styles.chipP]}>
        <Text style={[styles.chipText, styles.textP]}>P {protein}g</Text>
      </View>
      <View style={[styles.chip, styles.chipC]}>
        <Text style={[styles.chipText, styles.textC]}>C {carbs}g</Text>
      </View>
      <View style={[styles.chip, styles.chipF]}>
        <Text style={[styles.chipText, styles.textF]}>G {fat}g</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  chipText: { fontSize: 11, fontWeight: '600' },
  chipKcal: { backgroundColor: '#E8F8EE' },
  textKcal: { color: '#2DB36A' },
  chipP: { backgroundColor: '#FFEFE3' },
  textP: { color: '#FF8C42' },
  chipC: { backgroundColor: '#E0F4F8' },
  textC: { color: '#17A2B8' },
  chipF: { backgroundColor: '#FFF6D9' },
  textF: { color: '#B8860B' },
});
