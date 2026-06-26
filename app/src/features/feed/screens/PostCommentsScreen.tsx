import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@theme';
import { useFeedStore } from '../store';
import { CommentRow } from '../components/CommentRow';
import type { CommunityStackScreenProps } from '@navigation/types';

type Props = CommunityStackScreenProps<'PostComments'>;

export function PostCommentsScreen({ route }: Props): React.JSX.Element {
  const { postId } = route.params;
  const comments = useFeedStore((s) => s.commentsByPost[postId] ?? []);
  const isLoading = useFeedStore((s) => s.loadingCommentsByPost[postId] ?? false);
  const loadComments = useFeedStore((s) => s.loadComments);
  const addComment = useFeedStore((s) => s.addComment);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    loadComments(postId);
  }, [loadComments, postId]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    addComment(postId, text).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {isLoading && comments.length === 0 ? (
          <ActivityIndicator color={colors.brandPrimary} style={styles.loader} />
        ) : (
          <FlatList
            data={comments}
            keyExtractor={(c) => c.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => <CommentRow comment={item} />}
            ListEmptyComponent={<Text style={styles.empty}>Seja o primeiro a comentar.</Text>}
          />
        )}

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            placeholder="Escreva um comentário..."
            placeholderTextColor={colors.brandTextMuted}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={send}
            returnKeyType="send"
          />
          <Pressable
            onPress={send}
            style={styles.sendBtn}
            accessibilityRole="button"
            accessibilityLabel="Enviar"
          >
            <Text style={styles.sendIcon}>➤</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brandBackground },
  flex: { flex: 1 },
  loader: { marginTop: 32 },
  list: { padding: 16, flexGrow: 1 },
  empty: { textAlign: 'center', color: colors.brandTextMuted, marginTop: 32, fontSize: 14 },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.brandDivider,
  },
  input: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.brandText,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: { color: colors.white, fontSize: 16 },
});
