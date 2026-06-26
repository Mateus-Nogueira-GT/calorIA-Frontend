import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography, spacing, radius } from '@theme';

interface Props {
  emoji: string;
  title: string;
  description: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}

export function OnboardingOptionCard({
  emoji,
  title,
  description,
  selected,
  onPress,
  testID,
}: Props): React.JSX.Element {
  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.selected]}
      onPress={onPress}
      activeOpacity={0.8}
      testID={testID}
    >
      <View style={styles.content}>
        <Text style={styles.emoji}>{emoji}</Text>
        <View style={styles.text}>
          <Text variant="body" style={styles.title}>{title}</Text>
          <Text variant="caption">{description}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: spacing.sm,
    backgroundColor: colors.white,
  },
  selected: {
    borderColor: colors.primary,
    backgroundColor: colors.successSoft,
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  emoji: { fontSize: 22 },
  text: { flex: 1 },
  title: { fontFamily: typography.fontFamily.semiBold },
});
