import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { RootNavigator } from './RootNavigator';
import { useAuthStore } from '@features/auth/store';
import { useInviteStore } from '@features/invites/store';

jest.mock('@features/invites/screens/InviteScreen', () => {
  const React = jest.requireActual('react');
  const { Text, Pressable, View } = jest.requireActual('react-native');
  return {
    InviteScreen: ({
      token,
      onAuthenticate,
      onDone,
    }: {
      token: string;
      onAuthenticate: () => void;
      onDone: () => void;
    }) => (
      <View>
        <Text>{`invite:${token}`}</Text>
        <Pressable onPress={onAuthenticate}>
          <Text>Authenticate invitation</Text>
        </Pressable>
        <Pressable onPress={onDone}>
          <Text>Close invitation</Text>
        </Pressable>
      </View>
    ),
  };
});
jest.mock('@features/auth/screens/WelcomeScreen', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return { WelcomeScreen: () => <Text>Welcome route</Text> };
});
jest.mock('@features/auth/screens/ProfileSetupScreen', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return { ProfileSetupScreen: () => <Text>Profile setup route</Text> };
});
jest.mock('./BrandTabNavigator', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return { BrandTabNavigator: () => <Text>Authenticated home route</Text> };
});
jest.mock('@shared/services/diet.service', () => ({
  dietService: { getActiveJob: jest.fn().mockResolvedValue(null) },
}));
jest.mock('@shared/services/profile.service', () => ({
  ...jest.requireActual('@shared/services/profile.service'),
  profileService: { getMe: jest.fn() },
}));
const token = 'a'.repeat(43);
beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({
    isAuthenticated: false,
    user: null,
    hasHydrated: true,
    profileComplete: null,
  });
  useInviteStore.setState({ token: null, hydrated: true });
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
});
afterEach(() => {
  useInviteStore.setState({ token: null });
  jest.restoreAllMocks();
});
it('an invitation survives authentication and onboarding, then requires explicit confirmation', async () => {
  useInviteStore.getState().setToken(token);
  const screen = render(<RootNavigator />);
  expect(screen.getByText(`invite:${token}`)).toBeTruthy();
  fireEvent.press(screen.getByText('Authenticate invitation'));
  expect(await screen.findByText('Welcome route')).toBeTruthy();
  act(() =>
    useAuthStore.setState({
      isAuthenticated: true,
      profileComplete: false,
      user: { id: 'a', name: 'Ana', email: 'ana@example.test' },
    }),
  );
  expect(useInviteStore.getState().token).toBe(token);
  expect(screen.queryByText(`invite:${token}`)).toBeNull();
  act(() => useAuthStore.setState({ profileComplete: true }));
  expect(await screen.findByText(`invite:${token}`)).toBeTruthy();
  fireEvent.press(screen.getByText('Close invitation'));
  expect(await screen.findByText('Authenticated home route')).toBeTruthy();
  expect(useInviteStore.getState().token).toBeNull();
});
it('cold start stores a custom-scheme invitation before auth without redeeming', async () => {
  (Linking.getInitialURL as jest.Mock).mockResolvedValue(`caloria://invite/${token}`);
  const screen = render(<RootNavigator />);
  expect(await screen.findByText(`invite:${token}`)).toBeTruthy();
  expect(useInviteStore.getState().token).toBe(token);
});
it('ignores initial malformed invitation links', async () => {
  (Linking.getInitialURL as jest.Mock).mockResolvedValue('caloria://invite/not-valid');
  const screen = render(<RootNavigator />);
  expect(await screen.findByText('Welcome route')).toBeTruthy();
  await waitFor(() => expect(useInviteStore.getState().token).toBeNull());
});
it('universal link do domínio oficial recebido com o app aberto entrega o token ao store', async () => {
  let handler: (event: { url: string }) => void = () => {};
  jest.spyOn(Linking, 'addEventListener').mockImplementation((_type, listener) => {
    handler = listener as typeof handler;
    return { remove: jest.fn() } as unknown as ReturnType<typeof Linking.addEventListener>;
  });
  render(<RootNavigator />);
  act(() => handler({ url: `https://app.caloriaoficial.com.br/convite#${token}` }));
  await waitFor(() => expect(useInviteStore.getState().token).toBe(token));
});
