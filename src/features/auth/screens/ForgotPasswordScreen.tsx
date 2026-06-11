import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '@theme';
import { Text } from '@shared/components';
import type { AuthStackScreenProps } from '@navigation/types';

export function ForgotPasswordScreen(
  _props: AuthStackScreenProps<'ForgotPassword'>,
): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text variant="heading2">Recuperar senha</Text>
      <Text variant="caption">Em breve</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
