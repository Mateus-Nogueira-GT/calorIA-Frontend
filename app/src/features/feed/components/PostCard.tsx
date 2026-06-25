import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '@theme';
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
        <Avatar size='sm' emoji={post.author.avatarEmoji ?? '🙂'} backgroundColor={colors.brandSupportSoft} />
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
          hitSlop={8}
        >
          <Text style={styles.commentIcon}>💬</Text>
          <Text style={styles.commentCount}>{post.commentCount}</Text>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerText: { flex: 1 },
  author: { fontSize: 15, color: colors.brandAnchor, fontFamily: typography.fontFamily.semiBold },
  time: { fontSize: 12, color: colors.brandTextMuted, marginTop: 1 },
  content: { fontSize: 15, color: colors.brandText, marginTop: 10, lineHeight: 21 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 14 },
  commentBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  commentIcon: { fontSize: 16 },
  commentCount: { fontSize: 14, color: colors.brandTextMuted, fontFamily: typography.fontFamily.medium },
});
