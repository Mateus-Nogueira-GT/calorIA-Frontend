import React from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  ViewProps,
} from 'react-native';
import { colors, spacing, radius } from '@theme';

// onBlur/onFocus têm assinaturas diferentes em ViewProps e TouchableOpacityProps, e o
// Card repassa os mesmos props para os dois. Card não usa foco: omitir os dois resolve
// sem alargar tipo nenhum.
interface Props extends Omit<ViewProps, 'onBlur' | 'onFocus'> {
  onPress?: () => void;
  testID?: string;
  children: React.ReactNode;
}

export function Card({ onPress, children, style, testID, ...rest }: Props): React.JSX.Element {
  if (onPress) {
    return (
      <TouchableOpacity
        style={[styles.card, style]}
        onPress={onPress}
        activeOpacity={0.85}
        testID={testID}
        {...rest}
      >
        {children}
      </TouchableOpacity>
    );
  }
  return (
    <View style={[styles.card, style]} testID={testID} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
});
