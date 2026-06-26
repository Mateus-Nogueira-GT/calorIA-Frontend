import React from 'react';
import { Platform, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography, spacing, radius } from '@theme';

interface Props {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export function DateChip({ label, selected, onPress }: Props): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed, focused }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.chipPressed,
        focused && styles.focused,
      ]}
      accessibilityRole='button'
      accessibilityState={{ selected }}
      {...(Platform.OS === 'web' ? { ['aria-current' as const]: selected ? 'date' : undefined } : undefined)}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSurface,
    borderWidth: 1,
    borderColor: colors.brandDividerStrong,
    marginRight: 10,
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipPressed: { opacity: 0.9 },
  label: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.medium,
    color: colors.brandAnchor,
  },
  labelSelected: { color: colors.brandAnchor, fontFamily: typography.fontFamily.semiBold },
  focused: {
    outlineColor: colors.brandAnchor,
    outlineOffset: 2,
    outlineStyle: 'solid',
    outlineWidth: 2,
  } as ViewStyle,
});
