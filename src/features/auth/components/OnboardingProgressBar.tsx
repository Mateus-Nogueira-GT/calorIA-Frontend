import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@shared/components';
import { colors } from '@theme';

interface Props {
  current: number;
  total: number;
}

export function OnboardingProgressBar({ current, total }: Props): React.JSX.Element {
  const progress = current / total;
  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text variant="caption">Configurando seu perfil</Text>
        <Text variant="caption" color={colors.primary}>{current} / {total}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  track: { height: 3, backgroundColor: colors.border, borderRadius: 2 },
  fill: { height: 3, backgroundColor: colors.primary, borderRadius: 2 },
});
