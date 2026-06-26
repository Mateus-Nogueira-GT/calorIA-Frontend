import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { FeedScreen } from '@features/feed/screens/FeedScreen';
import { CreatePostScreen } from '@features/feed/screens/CreatePostScreen';
import { PostCommentsScreen } from '@features/feed/screens/PostCommentsScreen';
import { ChallengesScreen } from '@features/challenges/screens/ChallengesScreen';
import { CreateChallengeScreen } from '@features/challenges/screens/CreateChallengeScreen';
import { ChallengeLeaderboardScreen } from '@features/challenges/screens/ChallengeLeaderboardScreen';
import { NotificationsScreen } from '@features/notifications/screens/NotificationsScreen';
import { useNotificationPolling } from '@features/notifications/hooks/useNotificationPolling';
import { colors } from '@theme';
import type { CommunityStackParamList } from './types';

const Stack = createNativeStackNavigator<CommunityStackParamList>();

export function CommunityNavigator(): React.JSX.Element {
  useNotificationPolling();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.brandBackground },
        headerTintColor: colors.brandAnchor,
        headerShadowVisible: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name='Feed' component={FeedScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name='CreatePost'
        component={CreatePostScreen}
        options={{ presentation: 'modal', title: 'Novo post' }}
      />
      <Stack.Screen
        name='PostComments'
        component={PostCommentsScreen}
        options={{ title: 'Comentários' }}
      />
      <Stack.Screen name='Challenges' component={ChallengesScreen} options={{ headerShown: false }} />
      <Stack.Screen name='CreateChallenge' component={CreateChallengeScreen} options={{ presentation: 'modal', title: 'Novo desafio' }} />
      <Stack.Screen name='ChallengeLeaderboard' component={ChallengeLeaderboardScreen} options={{ title: 'Ranking' }} />
      <Stack.Screen name='Notifications' component={NotificationsScreen} options={{ title: 'Notificações' }} />
    </Stack.Navigator>
  );
}
