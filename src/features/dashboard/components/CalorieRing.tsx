import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';

interface Props { current: number; goal: number; size?: number }

export function CalorieRing({ current, goal, size = 120 }: Props): React.JSX.Element {
  const rawPercent = goal > 0 ? current / goal : 0;
  const percent = goal > 0 ? Math.min(Math.max(rawPercent, 0), 1) : 0;
  const displayPercent = goal > 0 ? Math.round(Math.max(rawPercent, 0) * 100) : 0;
  const angle = Math.round(percent * 360);
  const strokeWidth = Math.round(size * 0.085);
  const innerSize = size - strokeWidth * 2;

  const webStyle = Platform.OS === 'web'
    ? ({ backgroundImage: `conic-gradient(${colors.brandPrimary} ${angle}deg, ${colors.brandTrack} ${angle}deg)` } as object)
    : {};

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.outer,
          { width: size, height: size, borderRadius: size / 2 },
          Platform.OS !== 'web' && { borderWidth: strokeWidth, borderColor: colors.brandTrack },
          webStyle,
        ]}
      />
      <View
        style={{
          width: innerSize,
          height: innerSize,
          borderRadius: innerSize / 2,
          backgroundColor: colors.brandSurface,
        }}
      >
        <View style={styles.inner}>
          <Text style={styles.pct}>{displayPercent > 999 ? '999%+' : `${displayPercent}%`}</Text>
          <Text style={styles.caption}>atingido</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', justifyContent: 'center' },
  outer: { position: 'absolute' },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pct: { fontSize: typography.fontSize.lg, fontFamily: typography.fontFamily.extraBold, color: colors.brandAnchor },
  caption: { fontSize: typography.fontSize.xs, fontFamily: typography.fontFamily.medium, color: colors.brandTextMuted, marginTop: 2 },
});
