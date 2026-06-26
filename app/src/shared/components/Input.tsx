import React, { useState } from 'react';
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

export function Input({ label, error, rightIcon, style, ...rest }: Props): React.JSX.Element {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrapper}>
      <Text variant="label" style={styles.label}>
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
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...rest}
        />
        {rightIcon && <View style={styles.icon}>{rightIcon}</View>}
      </View>
      {error ? (
        <Text variant="caption" color={colors.error} style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.lg },
  label: { marginBottom: 6 },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  containerFocused: { borderColor: colors.primary },
  containerError: { borderColor: colors.error },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
  },
  icon: { paddingLeft: spacing.sm },
  error: { marginTop: spacing.xs },
});
