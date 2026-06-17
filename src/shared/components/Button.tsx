import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  PressableProps,
  StyleSheet,
  StyleProp,
  TextStyle,
  ViewStyle,
} from 'react-native';
import { colors, typography } from '@theme';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface Props extends Omit<PressableProps, 'children' | 'style'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
}

type PressablePressEvent = Parameters<NonNullable<PressableProps['onPress']>>[0];

interface WebKeyboardEvent {
  key?: string;
  preventDefault?: () => void;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  children,
  style,
  labelStyle,
  testID,
  onPress,
  ...rest
}: Props): React.JSX.Element {
  function handleWebKeyDown(event: WebKeyboardEvent) {
    if (
      Platform.OS === 'web' &&
      !disabled &&
      !loading &&
      (event.key === 'Enter' || event.key === ' ')
    ) {
      event.preventDefault?.();
      onPress?.(event as unknown as PressablePressEvent);
    }
  }

  return (
    <Pressable
      style={(state) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        size === 'sm' && styles.sm,
        size === 'md' && styles.md,
        size === 'lg' && styles.lg,
        (disabled || loading) && styles.disabled,
        !disabled && !loading && state.pressed && styles.pressed,
        !disabled && !loading && 'hovered' in state && state.hovered && styles.hovered,
        'focused' in state && state.focused && styles.focused,
        style,
      ]}
      disabled={disabled || loading}
      accessibilityRole="button"
      testID={testID}
      onPress={onPress}
      {...(Platform.OS === 'web' ? { onKeyDown: handleWebKeyDown } : undefined)}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator
          testID={testID ? `${testID}-loading` : 'btn-loading'}
          color={variant === 'primary' ? colors.white : colors.primary}
          size="small"
        />
      ) : (
        <Text
          style={[
            styles.label,
            variant === 'primary' && styles.labelPrimary,
            variant !== 'primary' && styles.labelSecondary,
            labelStyle,
          ]}
        >
          {children}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  hovered: { opacity: 0.9 },
  pressed: { transform: [{ scale: 0.98 }] },
  focused: {
    outlineColor: colors.brandAnchor,
    outlineOffset: 3,
    outlineStyle: 'solid',
    outlineWidth: 2,
  } as ViewStyle,
  primary: { backgroundColor: colors.primary },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghost: { backgroundColor: colors.transparent },
  sm: { paddingVertical: 8, paddingHorizontal: 16 },
  md: { paddingVertical: 14, paddingHorizontal: 24 },
  lg: { paddingVertical: 18, paddingHorizontal: 32 },
  disabled: { opacity: 0.5 },
  label: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.base,
  },
  labelPrimary: { color: colors.white },
  labelSecondary: { color: colors.textPrimary },
});
