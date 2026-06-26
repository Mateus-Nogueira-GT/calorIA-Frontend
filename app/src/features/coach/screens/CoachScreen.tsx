import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TabParamList } from '@navigation/types';
import { useCoachStore } from '../store';
import { ChatBubble } from '../components/ChatBubble';
import { ChatInput } from '../components/ChatInput';
import { TypingIndicator } from '../components/TypingIndicator';
import { GenerateDietButton } from '../components/GenerateDietButton';
import { Text } from '@shared/components';
import { colors, typography, spacing, radius } from '@theme';
import { CoachMark } from '../components/CoachMark';

const conversationSuggestions = [
  'Analise meu dia de alimentação',
  'Como posso bater minha meta de proteína?',
  'Sugira uma refeição equilibrada',
];

export function CoachScreen(): React.JSX.Element {
  const { messages, isLoading, error, hasLoadedHistory, loadHistory, sendMessage, retryLastAction } = useCoachStore();
  const nav = useNavigation<BottomTabNavigationProp<TabParamList>>();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList>(null);
  const [shouldStickToBottom, setShouldStickToBottom] = useState(true);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const lastCoachWithFlag = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'coach' && messages[i].dietGenerated) {
        return messages[i].id;
      }
    }
    return null;
  }, [messages]);

  useEffect(() => {
    if (!shouldStickToBottom) return;
    const timer = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 40);
    return () => clearTimeout(timer);
  }, [messages.length, isLoading, shouldStickToBottom]);

  async function handleSuggestionPress(suggestion: string) {
    await sendMessage(suggestion);
  }

  function handleScroll(event: { nativeEvent: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } } }) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    setShouldStickToBottom(distanceFromBottom < 96);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.select({ ios: 'padding', android: 'height', default: undefined })}
      keyboardVerticalOffset={Platform.select({ ios: spacing.md, android: 0, default: 0 })}
    >
      <View style={[styles.header, { paddingTop: Math.max(insets.top, spacing.xl) + spacing.md }]}>
        <CoachMark size='md' />
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Coach IA</Text>
          <View style={styles.statusRow}>
            <View style={styles.statusDot} />
            <Text style={styles.headerStatus}>Seu coach de nutrição</Text>
          </View>
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.chatContent}
        style={styles.list}
        renderItem={({ item }) => (
          <View>
            <ChatBubble
              message={item.content}
              role={item.role}
              timestamp={item.timestamp}
            />
            {item.id === lastCoachWithFlag && (
              <GenerateDietButton onSuccess={() => nav.navigate('Dashboard')} />
            )}
          </View>
        )}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps='handled'
        showsVerticalScrollIndicator={false}
        ListFooterComponent={isLoading ? <TypingIndicator /> : null}
        ListEmptyComponent={!hasLoadedHistory ? (
          <View style={styles.loadingState}>
            <CoachMark size='lg' />
            <Text style={styles.loadingTitle}>Preparando sua conversa</Text>
            <Text style={styles.loadingCopy}>Seu coach está organizando o histórico mais recente.</Text>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <CoachMark size='lg' tone='anchor' />
            <Text style={styles.emptyTitle}>Como posso ajudar hoje?</Text>
            <Text style={styles.emptyCopy}>Converse sobre alimentação, metas e sua rotina nutricional.</Text>
            <View style={styles.suggestions}>
              {conversationSuggestions.map((suggestion) => (
                <Pressable
                  key={suggestion}
                  onPress={() => void handleSuggestionPress(suggestion)}
                  style={({ pressed }) => [styles.suggestionButton, pressed && styles.suggestionButtonPressed]}
                  accessibilityRole='button'
                >
                  <Text style={styles.suggestionText}>{suggestion}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      />

      {error ? (
        <View style={styles.errorBar} accessibilityLiveRegion='polite'>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void retryLastAction()} style={styles.errorAction} accessibilityRole='button'>
            <Text style={styles.errorActionText}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : null}

      <ChatInput onSend={sendMessage} disabled={isLoading} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.brandBackground },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.brandDivider,
    backgroundColor: colors.brandBackground,
  },
  headerCopy: { flex: 1 },
  headerTitle: {
    color: colors.brandAnchor,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xs },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.brandPrimary,
  },
  headerStatus: {
    color: colors.brandTextMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
  },
  list: { flex: 1 },
  chatContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: 18,
    paddingBottom: spacing.sm,
  },
  emptyState: {
    flex: 1,
    minHeight: 420,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: 36,
  },
  loadingState: {
    flex: 1,
    minHeight: 420,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: 36,
  },
  loadingTitle: {
    marginTop: 18,
    color: colors.brandAnchor,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    textAlign: 'center',
  },
  loadingCopy: {
    marginTop: 10,
    maxWidth: 320,
    color: colors.brandTextMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.base,
    lineHeight: typography.fontSize.base * 1.5,
    textAlign: 'center',
  },
  emptyTitle: {
    marginTop: 18,
    color: colors.brandAnchor,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    textAlign: 'center',
  },
  emptyCopy: {
    marginTop: 10,
    maxWidth: 320,
    color: colors.brandTextMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.base,
    lineHeight: typography.fontSize.base * 1.5,
    textAlign: 'center',
  },
  suggestions: { width: '100%', marginTop: spacing.xxl, gap: 10 },
  suggestionButton: {
    minHeight: 44,
    backgroundColor: colors.brandSurface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  suggestionButtonPressed: { opacity: 0.9 },
  suggestionText: {
    color: colors.brandAnchor,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.sm,
  },
  errorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.brandDivider,
    backgroundColor: colors.brandSurface,
  },
  errorText: {
    flex: 1,
    color: colors.brandText,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
  },
  errorAction: {
    minHeight: 44,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandPrimarySoft,
  },
  errorActionText: {
    color: colors.brandAnchor,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.fontSize.sm,
  },
});
