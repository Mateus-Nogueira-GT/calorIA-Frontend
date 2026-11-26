import React from 'react';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import {
  NavigationContainer,
  createNavigationContainerRef,
  getStateFromPath,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { linking } from './RootNavigator';

type Route = { name: string; state?: { routes: Route[] } };

function communityStack(path: string): string[] {
  const state = getStateFromPath(path, linking.config) as unknown as { routes: Route[] };
  const app = state.routes[0];
  const community = app.state!.routes[0];
  return community.state!.routes.map((r) => r.name);
}

it('R6: deep link de desafio monta a Comunidade com o Feed embaixo', () => {
  expect(communityStack('challenge/ABC')).toEqual(['Feed', 'ChallengeLeaderboard']);
});

it('R6: deep link de post monta a Comunidade com o Feed embaixo', () => {
  expect(communityStack('post/abc')).toEqual(['Feed', 'PostComments']);
});

it('R6: voltar do ranking aberto por link cai no Feed da aba Comunidade', async () => {
  const Root = createNativeStackNavigator();
  const Tabs = createBottomTabNavigator();
  const Community = createNativeStackNavigator();
  const screen = (label: string) => () => <Text>{label}</Text>;
  const CommunityNav = () => (
    <Community.Navigator>
      <Community.Screen name="Feed" component={screen('tela Feed')} />
      <Community.Screen name="PostComments" component={screen('tela Comentários')} />
      <Community.Screen name="ChallengeLeaderboard" component={screen('tela Ranking')} />
    </Community.Navigator>
  );
  const AppTabs = () => (
    <Tabs.Navigator>
      <Tabs.Screen name="Home" component={screen('tela Home')} />
      <Tabs.Screen name="Community" component={CommunityNav} />
    </Tabs.Navigator>
  );
  const ref = createNavigationContainerRef();
  const initialState = getStateFromPath('challenge/ABC', linking.config);
  const view = render(
    <NavigationContainer ref={ref} initialState={initialState as never}>
      <Root.Navigator screenOptions={{ headerShown: false }}>
        <Root.Screen name="App" component={AppTabs} />
      </Root.Navigator>
    </NavigationContainer>,
  );
  expect(await view.findByText('tela Ranking')).toBeTruthy();
  expect(ref.canGoBack()).toBe(true);
  act(() => ref.goBack());
  expect(await view.findByText('tela Feed')).toBeTruthy();
});
