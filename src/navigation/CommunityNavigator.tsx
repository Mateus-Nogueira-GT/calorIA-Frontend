import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { FeedScreen } from '@features/feed/screens/FeedScreen';
import { CreatePostScreen } from '@features/feed/screens/CreatePostScreen';
import { PostCommentsScreen } from '@features/feed/screens/PostCommentsScreen';
import { colors } from '@theme';
import type { CommunityStackParamList } from './types';

const Stack = createNativeStackNavigator<CommunityStackParamList>();

export function CommunityNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.brandBackground },
        headerTintColor: colors.brandAnchor,
        headerShadowVisible: false,
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
    </Stack.Navigator>
  );
}
