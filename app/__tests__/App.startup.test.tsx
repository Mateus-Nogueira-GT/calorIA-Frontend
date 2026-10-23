import React from 'react';
import { act, render } from '@testing-library/react-native';
import App from '../App';
import { applyPendingUpdate, LAUNCH_WINDOW_MS } from '@shared/services/app-update.service';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  SafeAreaProvider: require('react-native').View,
}));

jest.mock('@navigation/RootNavigator', () => ({
  RootNavigator: () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Text } = require('react-native');
    return <Text testID="root-navigator">Navegação</Text>;
  },
}));
jest.mock('@shared/services/app-update.service', () => ({
  LAUNCH_WINDOW_MS: 6000,
  LONG_BACKGROUND_MS: 1800000,
  applyPendingUpdate: jest.fn(),
}));
const update = applyPendingUpdate as jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  update.mockReset();
});
afterEach(() => {
  jest.useRealTimers();
});

it('primeira abertura não monta cadastro/dashboard enquanto verifica o OTA', async () => {
  let finish!: (updated: boolean) => void;
  update.mockReturnValue(
    new Promise<boolean>((resolve) => {
      finish = resolve;
    }),
  );
  const tree = render(<App />);
  expect(tree.queryByTestId('root-navigator')).toBeNull();
  expect(tree.getByLabelText('Preparando o aplicativo')).toBeTruthy();
  await act(async () => {
    finish(false);
  });
  expect(tree.getByTestId('root-navigator')).toBeTruthy();
});

it('rede travada libera a navegação ao fim da janela, sem esperar indefinidamente', async () => {
  update.mockReturnValue(new Promise(() => {}));
  const tree = render(<App />);
  expect(tree.queryByTestId('root-navigator')).toBeNull();
  await act(async () => {
    jest.advanceTimersByTime(LAUNCH_WINDOW_MS);
  });
  expect(tree.getByTestId('root-navigator')).toBeTruthy();
});

it('erro de update libera a navegação', async () => {
  update.mockRejectedValue(new Error('offline'));
  const tree = render(<App />);
  await act(async () => {});
  expect(tree.getByTestId('root-navigator')).toBeTruthy();
});

it('desmontagem limpa o timer e ignora o fim tardio da checagem', async () => {
  let finish!: (updated: boolean) => void;
  update.mockReturnValue(
    new Promise<boolean>((resolve) => {
      finish = resolve;
    }),
  );
  const tree = render(<App />);
  expect(jest.getTimerCount()).toBeGreaterThan(0);
  tree.unmount();
  expect(jest.getTimerCount()).toBe(0);
  await act(async () => {
    finish(false);
  });
  expect(tree.toJSON()).toBeNull();
});
