import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text } from '@shared/components';
import { colors, spacing } from '@theme';

const label = 'Fechar';

/** Fecha telas abertas como modal (no iOS o modal não tem seta de voltar). */
export function HeaderCloseButton({ onPress }: { onPress: () => void }): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={12}
      style={styles.button}
    >
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  text: { color: colors.brandPrimaryText, fontWeight: '600' },
});
