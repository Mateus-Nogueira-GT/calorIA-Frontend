import React, { useId, useState } from 'react';
import {
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import { colors, typography, spacing, radius } from '@theme';
import { Text } from './Text';

interface Props extends TextInputProps {
  label: string;
  error?: string;
  rightIcon?: React.ReactNode;
}

export function Input({ label, error, rightIcon, style, onFocus, onBlur, ...rest }: Props): React.JSX.Element {
  const id = useId();
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrapper}>
      <Text nativeID={`${id}-label`} variant="label" style={styles.label}>
        {label}
      </Text>
      <View
        style={[
          styles.container,
          focused && styles.containerFocused,
          error ? styles.containerError : undefined,
        ]}
      >
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={colors.textDisabled}
          accessibilityLabel={label}
          accessibilityHint={error}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          onFocus={(event) => { setFocused(true); onFocus?.(event); }}
          onBlur={(event) => { setFocused(false); onBlur?.(event); }}
          {...rest}
        />
        {rightIcon && <View style={styles.icon}>{rightIcon}</View>}
      </View>
      {error ? (
        <Text nativeID={`${id}-error`} accessibilityLiveRegion="polite" variant="caption" color={colors.error} style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.lg },
  label: { marginBottom: 8, fontSize: typography.fontSize.sm, textTransform: 'none', letterSpacing: 0, color: colors.brandAnchor },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.brandSurface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  containerFocused: { borderColor: colors.brandAnchor, backgroundColor: colors.white },
  containerError: { borderColor: colors.error },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    paddingVertical: 14,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
  },
  icon: { paddingLeft: spacing.sm },
  error: { marginTop: spacing.xs },
});
