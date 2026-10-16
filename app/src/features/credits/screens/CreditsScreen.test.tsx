import React from 'react';
import { act, render } from '@testing-library/react-native';
import { CreditsScreen } from './CreditsScreen';
import { useCreditsStore } from '../store';
import { useAuthStore } from '@features/auth/store';
import { creditsService, Wallet } from '@shared/services/credits.service';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
  useFocusEffect: (effect: () => void) => {
    const ReactHooks = jest.requireActual('react');
    ReactHooks.useEffect(effect, [effect]);
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }),
}));
jest.mock('@shared/services/credits.service', () => ({
  ...jest.requireActual('@shared/services/credits.service'),
  creditsService: { wallet: jest.fn(), ledger: jest.fn() },
}));
const wallet: Wallet = {
  balance_units: 75,
  reserved_units: 15,
  available_units: 60,
  units_per_credit: 5,
  enforcement_enabled: false,
  invites_enabled: false,
  policy: { photo_units: 15, message_units: 1, welcome_units: 75, version: 'test' },
};
const ledger = creditsService.ledger as jest.Mock;
beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({
    sessionGeneration: 30,
    isAuthenticated: true,
    user: { id: 'a', name: 'Ana', email: 'ana@example.test' },
  });
  useCreditsStore.getState().clear();
  (creditsService.wallet as jest.Mock).mockResolvedValue(wallet);
  ledger.mockResolvedValue({ items: [], next_cursor: null });
});
it('shows available and held separately, with enforcement status', async () => {
  const screen = render(<CreditsScreen />);
  expect(await screen.findByText('12 créditos disponíveis')).toBeTruthy();
  expect(screen.getByText(/3 em processamento/)).toBeTruthy();
  expect(screen.getByText('A cobrança por créditos ainda não está ativa.')).toBeTruthy();
});
it('wallet failure is distinct from zero balance and leaves history readable', async () => {
  (creditsService.wallet as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  ledger.mockResolvedValue({
    items: [
      {
        id: 'l1',
        units: 75,
        kind: 'welcome',
        operation_id: null,
        created_at: '2026-10-15T12:00:00Z',
      },
    ],
    next_cursor: null,
  });
  const screen = render(<CreditsScreen />);
  expect(await screen.findByText('Não foi possível consultar seu saldo.')).toBeTruthy();
  expect(screen.getByText('Créditos de boas-vindas')).toBeTruthy();
  expect(screen.queryByText('0 créditos disponíveis')).toBeNull();
});
it('changing account removes the previous ledger while requesting the new ledger', async () => {
  ledger
    .mockResolvedValueOnce({
      items: [
        {
          id: 'l1',
          units: 75,
          kind: 'welcome',
          operation_id: null,
          created_at: '2026-10-15T12:00:00Z',
        },
      ],
      next_cursor: null,
    })
    .mockReturnValue(new Promise(() => {}));
  const screen = render(<CreditsScreen />);
  await screen.findByText('Créditos de boas-vindas');
  act(() =>
    useAuthStore.setState({
      sessionGeneration: 31,
      user: { id: 'b', name: 'Bia', email: 'bia@example.test' },
    }),
  );
  expect(screen.queryByText('Créditos de boas-vindas')).toBeNull();
});
