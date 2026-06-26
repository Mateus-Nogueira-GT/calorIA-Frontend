import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '@theme';
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
    gap: 12,
    backgroundColor: colors.brandSupportSoft,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  emoji: { fontSize: 26 },
  texts: { flex: 1 },
  title: { fontSize: 15, color: colors.brandAnchor, fontFamily: typography.fontFamily.semiBold },
  subtitle: { fontSize: 13, color: colors.brandTextMuted, marginTop: 2, fontFamily: typography.fontFamily.regular },
});
