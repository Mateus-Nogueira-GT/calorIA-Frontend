import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useAuthStore, type CoachPersonalityPreference } from '@features/auth/store';
import { Text } from '@shared/components';
import { colors, radius, spacing, typography } from '@theme';
import type { RootStackScreenProps } from '@navigation/types';

const PERSONALITY_OPTIONS: Array<{
  value: CoachPersonalityPreference;
  title: string;
  description: string;
}> = [
  {
    value: 'motivational',
    title: 'Motivador',
    description: 'Traz mais energia, incentivo e reforco positivo nas interacoes.',
  },
  {
    value: 'direct',
    title: 'Direto',
    description: 'Vai ao ponto com orientacoes objetivas e sem rodeios.',
  },
  {
    value: 'empathetic',
    title: 'Empatico',
    description: 'Fala com mais acolhimento, contexto e apoio emocional.',
  },
  {
    value: 'scientific',
    title: 'Cientifico',
    description: 'Explica decisoes com mais base tecnica e racional.',
  },
];

export function ProfileCoachPersonalityScreen(
  { navigation }: RootStackScreenProps<'ProfileCoachPersonality'>,
): React.JSX.Element {
  const selectedPersonality = useAuthStore((state) => state.profilePreferences.coachPersonality);
  const setProfilePreferences = useAuthStore((state) => state.setProfilePreferences);

  function handleSelect(coachPersonality: CoachPersonalityPreference) {
    setProfilePreferences({ coachPersonality });
    navigation.goBack();
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text variant="heading2" style={styles.title}>Personalidade do Coach</Text>
        <Text variant="body" style={styles.subtitle}>
          Defina o tom que combina melhor com a forma como voce gosta de receber orientacao.
        </Text>
      </View>

      <View style={styles.list}>
        {PERSONALITY_OPTIONS.map((option) => {
          const selected = option.value === selectedPersonality;

          return (
            <TouchableOpacity
              key={option.value}
              activeOpacity={0.85}
              onPress={() => handleSelect(option.value)}
              style={[styles.optionCard, selected && styles.optionCardSelected]}
            >
              <Text variant="heading3" style={styles.optionTitle}>{option.title}</Text>
              <Text variant="body" style={styles.optionDescription}>{option.description}</Text>
              <Text variant="caption" style={[styles.optionAction, selected && styles.optionActionSelected]}>
                {selected ? 'Selecionado' : 'Selecionar'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.brandBackground,
  },
  content: {
    padding: spacing.xl,
    paddingTop: 28,
  },
  header: {
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  title: {
    color: colors.brandAnchor,
  },
  subtitle: {
    color: colors.brandText,
  },
  list: {
    gap: spacing.md,
  },
  optionCard: {
    backgroundColor: colors.white,
    borderColor: colors.brandDivider,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 18,
    gap: spacing.sm,
  },
  optionCardSelected: {
    borderColor: colors.brandPrimary,
    backgroundColor: colors.brandPrimarySoft,
  },
  optionTitle: {
    color: colors.brandAnchor,
    fontSize: typography.fontSize.lg,
  },
  optionDescription: {
    color: colors.brandText,
  },
  optionAction: {
    color: colors.brandPrimary,
    fontFamily: typography.fontFamily.semiBold,
    marginTop: spacing.xs,
  },
  optionActionSelected: {
    color: colors.brandAnchor,
  },
});
