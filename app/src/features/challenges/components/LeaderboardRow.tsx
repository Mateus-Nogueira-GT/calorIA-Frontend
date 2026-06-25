import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '@theme';
import { Avatar } from '@shared/components/Avatar';
import type { LeaderboardEntry } from '@shared/services/challenges.service';

export function LeaderboardRow({ entry }: { entry: LeaderboardEntry }): React.JSX.Element {
  const isTop3 = entry.rank <= 3;
  return (
    <View
      testID='leaderboard-row'
      accessibilityState={{ selected: entry.isMe }}
      style={[styles.row, entry.isMe && styles.rowMe]}
    >
      <View style={[styles.rankBadge, isTop3 && styles.rankBadgeTop]}>
        <Text style={[styles.rankText, isTop3 && styles.rankTextTop]}>{entry.rank}</Text>
      </View>
      <Avatar size='sm' emoji={entry.user.avatarEmoji ?? '🙂'} backgroundColor={colors.brandMutedSurface} />
      <Text style={styles.name}>{entry.user.name}</Text>
      <Text style={styles.streak}>🔥 {entry.streak}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12 },
  rowMe: { backgroundColor: colors.brandSupportSoft },
  rankBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.brandMutedSurface, alignItems: 'center', justifyContent: 'center' },
  rankBadgeTop: { backgroundColor: colors.brandSupport },
  rankText: { fontSize: 13, color: colors.brandTextMuted, fontFamily: typography.fontFamily.bold },
  rankTextTop: { color: colors.brandAnchor },
  name: { flex: 1, fontSize: 15, color: colors.brandAnchor, fontFamily: typography.fontFamily.semiBold },
  streak: { fontSize: 14, color: colors.brandText, fontFamily: typography.fontFamily.medium },
});
