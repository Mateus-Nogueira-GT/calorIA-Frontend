import React from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';

interface Props { current: number; goal: number; size?: number }

export function CalorieRing({ current, goal, size = 120 }: Props): React.JSX.Element {
  const percent = goal > 0 ? Math.min(current / goal, 1) : 0;
  const angle = Math.round(percent * 360);
  const strokeWidth = Math.round(size * 0.085);
  const innerSize = size - strokeWidth * 2;

  const webStyle = Platform.OS === 'web'
    ? ({ backgroundImage: `conic-gradient(${colors.primary} ${angle}deg, ${colors.border} ${angle}deg)` } as object)
    : {};

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={[
        { position: 'absolute', width: size, height: size, borderRadius: size / 2 },
        Platform.OS !== 'web' && { borderWidth: strokeWidth, borderColor: colors.border },
        webStyle,
      ]} />
      <View style={{
        width: innerSize,
        height: innerSize,
        borderRadius: innerSize / 2,
        backgroundColor: colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
      }}>
        <Text style={styles.pct}>{Math.round(percent * 100)}%</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pct: { fontSize: typography.fontSize.sm, fontFamily: typography.fontFamily.bold, color: colors.textPrimary },
});
