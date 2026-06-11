import React, { useEffect } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useCoachStore } from '../store';
import { ChatBubble } from '../components/ChatBubble';
import { ChatInput } from '../components/ChatInput';
import { TypingIndicator } from '../components/TypingIndicator';
import { Avatar, Text } from '@shared/components';
import { colors } from '@theme';

export function CoachScreen(): React.JSX.Element {
  const { messages, isLoading, loadHistory, sendMessage } = useCoachStore();

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Avatar size="md" emoji="🤖" />
        <View>
          <Text variant="heading2">Coach IA</Text>
          <Text variant="caption" color={colors.primary}>● online</Text>
        </View>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.chatContent}
        renderItem={({ item }) => (
          <ChatBubble
            message={item.content}
            role={item.role}
            timestamp={item.timestamp}
          />
        )}
        ListFooterComponent={isLoading ? <TypingIndicator /> : null}
        onContentSizeChange={() => {}}
      />

      <ChatInput onSend={sendMessage} disabled={isLoading} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    paddingTop: 56,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  chatContent: { padding: 16, paddingBottom: 8 },
});
