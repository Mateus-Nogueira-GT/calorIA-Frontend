import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, typography, spacing } from '@theme';
import { Card } from '@shared/components/Card';
import { Avatar } from '@shared/components/Avatar';
import { timeAgo } from '@shared/utils/date';
import type { Post } from '@shared/services/feed.service';
import { LikeButton } from './LikeButton';
import { AchievementCard } from './AchievementCard';

interface Props {
  post: Post;
  onPressComments: (postId: string) => void;
  onToggleLike: (postId: string) => void;
}

export function PostCard({ post, onPressComments, onToggleLike }: Props): React.JSX.Element {
  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Avatar size='sm' uri={post.author.avatarUrl} emoji={post.author.avatarEmoji ?? '🙂'} backgroundColor={colors.brandSupportSoft} />
        <View style={styles.headerText}>
          <Text style={styles.author}>{post.author.name}</Text>
          <Text style={styles.time}>{timeAgo(post.createdAt)}</Text>
        </View>
      </View>

      <Text style={styles.content}>{post.content}</Text>
      {post.achievement ? <AchievementCard achievement={post.achievement} /> : null}

      <View style={styles.actions}>
        <LikeButton liked={post.likedByMe} count={post.likeCount} onPress={() => onToggleLike(post.id)} />
        <Pressable
          testID='comments-button'
          onPress={() => onPressComments(post.id)}
          style={styles.commentBtn}
          accessibilityRole='button'
          hitSlop={spacing.sm}
        >
          <Text style={styles.commentIcon}>💬</Text>
          <Text style={styles.commentCount}>{post.commentCount}</Text>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerText: { flex: 1 },
  author: { fontSize: typography.fontSize.base, color: colors.brandAnchor, fontFamily: typography.fontFamily.semiBold },
  time: { fontSize: 12, color: colors.brandTextMuted, marginTop: 1 },
  content: { fontSize: typography.fontSize.base, color: colors.brandText, marginTop: 10, lineHeight: 21 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl, marginTop: 14 },
  commentBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  commentIcon: { fontSize: typography.fontSize.md },
  commentCount: { fontSize: typography.fontSize.base, color: colors.brandTextMuted, fontFamily: typography.fontFamily.medium },
});
