import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useAuthStore, type GoalPreference } from '@features/auth/store';
import { Text, screenShellStyle } from '@shared/components';
import { colors, radius, spacing, typography } from '@theme';
import type { RootStackScreenProps } from '@navigation/types';

const GOAL_OPTIONS: Array<{
  value: GoalPreference;
  title: string;
  description: string;
}> = [
  {
    value: 'lose_weight',
    title: 'Perder peso',
    description: 'Prioriza um plano com foco em deficit calorico e consistencia.',
  },
  {
    value: 'gain_muscle',
    title: 'Ganhar massa',
    description: 'Ajusta a rotina para favorecer superavit e recuperacao.',
  },
  {
    value: 'maintain',
    title: 'Manter peso',
    description: 'Equilibra calorias e macros para estabilidade no dia a dia.',
  },
  {
    value: 'health',
    title: 'Melhorar saude',
    description: 'Dá mais peso a habitos sustentaveis e qualidade alimentar.',
  },
];

export function ProfileGoalsScreen({ navigation }: RootStackScreenProps<'ProfileGoals'>): React.JSX.Element {
  const selectedGoal = useAuthStore((state) => state.profilePreferences.goal);
  const setProfilePreferences = useAuthStore((state) => state.setProfilePreferences);

  function handleSelect(goal: GoalPreference) {
    setProfilePreferences({ goal });
    navigation.goBack();
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text variant="heading2" style={styles.title}>Metas e objetivos</Text>
        <Text variant="body" style={styles.subtitle}>
          Escolha o foco principal para orientar o acompanhamento dentro do app.
        </Text>
      </View>

      <View style={styles.list}>
        {GOAL_OPTIONS.map((option) => {
          const selected = option.value === selectedGoal;

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
    ...screenShellStyle,
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
