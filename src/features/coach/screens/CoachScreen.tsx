import React, { useEffect, useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { TabParamList } from '@navigation/types';
import { useCoachStore } from '../store';
import { ChatBubble } from '../components/ChatBubble';
import { ChatInput } from '../components/ChatInput';
import { TypingIndicator } from '../components/TypingIndicator';
import { GenerateDietButton } from '../components/GenerateDietButton';
import { Avatar, Text } from '@shared/components';
import { colors } from '@theme';

export function CoachScreen(): React.JSX.Element {
  const { messages, isLoading, loadHistory, sendMessage } = useCoachStore();
  const nav = useNavigation<BottomTabNavigationProp<TabParamList>>();

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const lastCoachWithFlag = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'coach' && messages[i].canGenerateDiet) {
        return messages[i].id;
      }
    }
    return null;
  }, [messages]);

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
        ListFooterComponent={isLoading ? <TypingIndicator /> : null}
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
