import React from 'react';
import { DimensionValue, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius } from '@theme';
import { Button, Text } from '@shared/components';
import type { AuthStackScreenProps } from '@navigation/types';

const createAccountLabel = 'Criar conta';
const loginLabel = 'Já tenho conta';

export function WelcomeScreen({ navigation }: AuthStackScreenProps<'Welcome'>): React.JSX.Element {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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

        <View style={styles.introduction}>
          <Text accessibilityRole="header" style={styles.headline}>Seu prato. Seu ritmo.</Text>
          <Text style={styles.introCopy}>Entenda sua alimentação e acompanhe suas metas, uma refeição de cada vez.</Text>
        </View>

        <View style={styles.features}>
          {[
            ['01', 'Fotografe sua refeição', 'Receba uma estimativa de calorias e nutrientes.'],
            ['02', 'Acompanhe seu dia', 'Refeições, macronutrientes e evolução em um só lugar.'],
            ['03', 'Converse com seu coach', 'Uma IA para ajudar com seu plano e sua rotina.'],
          ].map(([number, title, description]) => (
            <View key={number} style={styles.feature}>
              <Text style={styles.featureNumber}>{number}</Text>
              <View style={styles.featureCopy}>
                <Text style={styles.featureTitle}>{title}</Text>
                <Text style={styles.featureDescription}>{description}</Text>
              </View>
            </View>
          ))}
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
        <Text style={styles.footnote}>Estimativas de IA. Você pode revisar os resultados antes de salvar.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const interfaceFont = Platform.select({
  web: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  default: typography.fontFamily.regular,
});

const interfaceSemiBoldFont = Platform.select({
  web: '"Inter-SemiBold", Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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
    flexGrow: 1,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,

  },
  brandBlock: {
    alignItems: 'flex-start',
  },
  logoFallback: {
    color: colors.brandAnchor,
    fontFamily: interfaceSemiBoldFont,
    fontSize: 38,
    lineHeight: 46,
    textAlign: 'center',
  },
  logoAccent: {
    color: colors.brandPrimary,
    fontFamily: interfaceSemiBoldFont,
    fontSize: 38,
    lineHeight: 46,
  },
  tagline: {
    color: colors.brandText,
    fontFamily: interfaceFont,
    fontSize: typography.fontSize.md,
    lineHeight: 23,
    marginTop: spacing.sm,
    maxWidth: 360,
    textAlign: 'left',
    width: '100%',
  },
  introduction: { marginTop: spacing.xxxl, marginBottom: spacing.xxl },
  headline: { fontSize: typography.fontSize.xxl, fontFamily: typography.fontFamily.extraBold, color: colors.brandAnchor, lineHeight: 38 },
  introCopy: { color: colors.brandTextMuted, marginTop: spacing.sm, lineHeight: 24 },
  features: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.brandDivider },
  feature: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg, paddingVertical: spacing.lg },
  featureNumber: { fontFamily: typography.fontFamily.bold, color: colors.brandPrimaryText, fontSize: typography.fontSize.sm, paddingTop: 3 },
  featureCopy: { flex: 1 },
  featureTitle: { fontFamily: typography.fontFamily.semiBold, color: colors.brandAnchor },
  featureDescription: { color: colors.brandTextMuted, fontSize: typography.fontSize.sm, marginTop: spacing.xs, lineHeight: 20 },
  footnote: { color: colors.brandTextMuted, fontSize: typography.fontSize.xs, textAlign: 'center', lineHeight: 18, marginTop: spacing.lg },
  actions: {
    gap: spacing.md,
    marginTop: spacing.xxl,
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
