import React from 'react';
import { DimensionValue, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius } from '@theme';
import { Button, Text } from '@shared/components';
import type { AuthStackScreenProps } from '@navigation/types';

const createAccountLabel = 'Criar conta';
const loginLabel = 'Já tenho conta';

export function WelcomeScreen({ navigation }: AuthStackScreenProps<'Welcome'>): React.JSX.Element {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.brandBlock}>
          <Text
            accessibilityRole="header"
            variant="heading1"
            style={styles.logoFallback}
          >
            calor<Text variant="heading1" style={styles.logoAccent}>IA</Text>
          </Text>
          <Text variant="body" style={styles.tagline}>
            Seu coach de nutrição com inteligência artificial
          </Text>
        </View>

        <View style={styles.actions}>
          <Button
            onPress={() => navigation.navigate('Register')}
            size="lg"
            style={[styles.button, styles.primaryButton]}
            labelStyle={styles.primaryButtonLabel}
          >
            {createAccountLabel}
          </Button>
          <Button
            variant="ghost"
            onPress={() => navigation.navigate('Login')}
            size="lg"
            style={[styles.button, styles.secondaryButton]}
            labelStyle={styles.secondaryButtonLabel}
          >
            {loginLabel}
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}

const interfaceFont = Platform.select({
  web: '"DM Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  default: typography.fontFamily.regular,
});

const interfaceSemiBoldFont = Platform.select({
  web: '"DM Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  default: typography.fontFamily.semiBold,
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    // '100dvh' é uma unidade CSS que o react-native-web repassa ao browser (resolve a
    // barra de endereço no mobile web). DimensionValue do RN não modela unidades CSS,
    // por isso o cast — o valor é legítimo na única plataforma onde é usado.
    minHeight: Platform.select<DimensionValue>({ web: '100dvh' as DimensionValue, default: '100%' }),
    backgroundColor: colors.brandBackground,
    paddingHorizontal: 22,
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
    transform: [{ translateY: -18 }],
  },
  brandBlock: {
    alignItems: 'center',
  },
  logoFallback: {
    color: colors.brandAnchor,
    fontFamily: interfaceSemiBoldFont,
    fontSize: 46,
    lineHeight: 54,
    textAlign: 'center',
  },
  logoAccent: {
    color: colors.brandPrimary,
    fontFamily: interfaceSemiBoldFont,
    fontSize: 46,
    lineHeight: 54,
  },
  tagline: {
    color: colors.brandText,
    fontFamily: interfaceFont,
    fontSize: typography.fontSize.md,
    lineHeight: 23,
    marginTop: 22,
    maxWidth: 320,
    textAlign: 'center',
    width: '100%',
  },
  actions: {
    gap: spacing.md,
    marginTop: 38,
    width: '100%',
  },
  button: {
    borderRadius: radius.lg,
    minHeight: 52,
    paddingHorizontal: spacing.xl,
    paddingVertical: 0,
    width: '100%',
  },
  primaryButton: {
    backgroundColor: colors.brandPrimary,
  },
  secondaryButton: {
    backgroundColor: colors.transparent,
    borderColor: colors.brandAnchor,
    borderWidth: 1.5,
  },
  primaryButtonLabel: {
    color: colors.brandAnchor,
    fontFamily: interfaceSemiBoldFont,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semiBold,
  },
  secondaryButtonLabel: {
    color: colors.brandAnchor,
    fontFamily: interfaceSemiBoldFont,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semiBold,
  },
});
