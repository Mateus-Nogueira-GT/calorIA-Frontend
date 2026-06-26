import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography, spacing, radius } from '@theme';
import type { PostAchievement } from '@shared/services/feed.service';

export function AchievementCard({ achievement }: { achievement: PostAchievement }): React.JSX.Element {
  return (
    <View style={styles.card}>
      <Text style={styles.emoji}>{achievement.emoji}</Text>
      <View style={styles.texts}>
        <Text style={styles.title}>{achievement.title}</Text>
        <Text style={styles.subtitle}>{achievement.subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.brandSupportSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: 10,
  },
  emoji: { fontSize: 26 },
  texts: { flex: 1 },
  title: { fontSize: typography.fontSize.base, color: colors.brandAnchor, fontFamily: typography.fontFamily.semiBold },
  subtitle: { fontSize: typography.fontSize.sm, color: colors.brandTextMuted, marginTop: 2, fontFamily: typography.fontFamily.regular },
});
