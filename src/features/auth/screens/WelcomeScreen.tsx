import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, typography } from '@theme';
import { Button, Text } from '@shared/components';
import type { AuthStackScreenProps } from '@navigation/types';

export function WelcomeScreen({ navigation }: AuthStackScreenProps<'Welcome'>): React.JSX.Element {
  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text variant="heading1" style={styles.logo}>
          calor<Text variant="heading1" color={colors.primary}>IA</Text>
        </Text>
        <Text variant="body" color={colors.textSecondary} style={styles.tagline}>
          Seu coach de nutrição com inteligência artificial
        </Text>
      </View>

      <View style={styles.actions}>
        <Button onPress={() => navigation.navigate('Register')} size="lg" style={styles.btn}>
          Criar conta
        </Button>
        <Button
          variant="ghost"
          onPress={() => navigation.navigate('Login')}
          size="lg"
          style={styles.btn}
        >
          Já tenho conta
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    paddingTop: 120,
    paddingBottom: 48,
  },
  hero: { alignItems: 'center', gap: 12 },
  logo: { fontSize: 48, fontFamily: typography.fontFamily.extraBold },
  tagline: { textAlign: 'center', maxWidth: 260 },
  actions: { gap: 12 },
  btn: { width: '100%' },
});
