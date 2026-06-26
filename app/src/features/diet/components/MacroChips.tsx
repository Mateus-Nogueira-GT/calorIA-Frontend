import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@shared/components';
import { colors, radius, spacing, typography } from '@theme';

interface Props {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export function MacroChips({ kcal, protein, carbs, fat }: Props): React.JSX.Element {
  return (
    <View style={styles.row}>
      <View style={[styles.chip, styles.chipNeutral]}>
        <Text style={[styles.chipText, styles.textNeutral]}>{kcal} kcal</Text>
      </View>
      <View style={[styles.chip, styles.chipProtein]}>
        <Text style={[styles.chipText, styles.textProtein]}>P {protein}g</Text>
      </View>
      <View style={[styles.chip, styles.chipCarbs]}>
        <Text style={[styles.chipText, styles.textCarbs]}>C {carbs}g</Text>
      </View>
      <View style={[styles.chip, styles.chipFat]}>
        <Text style={[styles.chipText, styles.textFat]}>G {fat}g</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.md },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  chipText: { fontSize: typography.fontSize.xs, fontFamily: typography.fontFamily.semiBold },
  chipNeutral: { backgroundColor: colors.brandMutedSurface },
  textNeutral: { color: colors.brandAnchor },
  chipProtein: { backgroundColor: colors.brandPrimarySoft },
  textProtein: { color: colors.brandPrimary },
  chipCarbs: { backgroundColor: colors.brandAnchorSoft },
  textCarbs: { color: colors.brandAnchor },
  chipFat: { backgroundColor: colors.brandSupportSoft },
  textFat: { color: colors.brandSupport },
});
