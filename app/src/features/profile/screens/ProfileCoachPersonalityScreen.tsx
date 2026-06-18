import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useAuthStore, type CoachPersonalityPreference } from '@features/auth/store';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';
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
    padding: 20,
    paddingTop: 28,
  },
  header: {
    marginBottom: 20,
    gap: 8,
  },
  title: {
    color: colors.brandAnchor,
  },
  subtitle: {
    color: colors.brandText,
  },
  list: {
    gap: 12,
  },
  optionCard: {
    backgroundColor: colors.white,
    borderColor: colors.brandDivider,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 8,
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
    marginTop: 4,
  },
  optionActionSelected: {
    color: colors.brandAnchor,
  },
});
