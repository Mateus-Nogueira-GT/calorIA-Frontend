import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography, spacing } from '@theme';
import { Avatar } from '@shared/components/Avatar';
import { timeAgo } from '@shared/utils/date';
import type { Comment } from '@shared/services/feed.service';

export function CommentRow({ comment }: { comment: Comment }): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Avatar size='sm' emoji={comment.author.avatarEmoji ?? '🙂'} backgroundColor={colors.brandMutedSurface} />
      <View style={styles.body}>
        <View style={styles.headRow}>
          <Text style={styles.author}>{comment.author.name}</Text>
          <Text style={styles.time}>{timeAgo(comment.createdAt)}</Text>
        </View>
        <Text style={styles.content}>{comment.content}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, paddingVertical: 10 },
  body: { flex: 1 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  author: { fontSize: typography.fontSize.base, color: colors.brandAnchor, fontFamily: typography.fontFamily.semiBold },
  time: { fontSize: 12, color: colors.brandTextMuted },
  content: { fontSize: typography.fontSize.base, color: colors.brandText, marginTop: 2, lineHeight: 20 },
});
