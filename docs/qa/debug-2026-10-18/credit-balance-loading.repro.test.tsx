import React from 'react';
import { act, render } from '@testing-library/react-native';
import { CreditBalance } from '@features/credits/components/CreditBalance';
import { useCreditsStore } from '@features/credits/store';
import { useAuthStore } from '@features/auth/store';
import { creditsService, Wallet } from '@shared/services/credits.service';

jest.mock('@shared/services/credits.service', () => ({
  creditsService: { wallet: jest.fn() },
  subscribeCreditChange: jest.fn(),
  formatCredits: (units: number) => String(units / 5),
}));
const read = creditsService.wallet as jest.Mock;
const wallet = (enabled: boolean): Wallet => ({
  balance_units: 75,
  reserved_units: 0,
  available_units: 75,
  units_per_credit: 5,
  enforcement_enabled: enabled,
  invites_enabled: false,
  policy: { photo_units: 15, message_units: 1, welcome_units: 75, version: 'test' },
});

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({
    sessionGeneration: 70,
    isAuthenticated: true,
    user: { id: 'a', name: 'Ana', email: 'ana@example.test' },
  });
  useCreditsStore.getState().clear();
});

it('créditos desligados: falha ao consultar não mostra "Saldo indisponível"', async () => {
  read.mockRejectedValueOnce(new Error('offline'));
  const screen = render(<CreditBalance onPress={() => {}} />);
  await act(async () => {});
  expect(screen.queryByText(/Saldo indisponível/)).toBeNull();
  expect(screen.toJSON()).toBeNull();
});

it('créditos ativos: falha depois de um saldo carregado mostra o aviso', async () => {
  read.mockResolvedValueOnce(wallet(true));
  const screen = render(<CreditBalance onPress={() => {}} />);
  await act(async () => {});
  expect(screen.getByText(/créditos disponíveis/)).toBeTruthy();

  read.mockRejectedValueOnce(new Error('offline'));
  await act(async () => {
    await useCreditsStore.getState().load();
  });
  expect(screen.getByText(/Saldo indisponível/)).toBeTruthy();
});

it('créditos desligados com saldo carregado: nada aparece', async () => {
  read.mockResolvedValueOnce(wallet(false));
  const screen = render(<CreditBalance onPress={() => {}} />);
  await act(async () => {});
  expect(screen.toJSON()).toBeNull();
});


it('retry cannot report a fabricated zero while a known active wallet is unavailable', async () => {
  read.mockReturnValueOnce(new Promise(() => {}));
  useCreditsStore.setState({ wallet: null, featureVisible: true, loading: false, error: 'Não foi possível consultar seu saldo.' });
  const screen = render(<CreditBalance onPress={() => {}} />);
  await act(async () => {});
  console.log('REPRO_BALANCE_RETRY', JSON.stringify({ loading: useCreditsStore.getState().loading, wallet: useCreditsStore.getState().wallet, error: useCreditsStore.getState().error, displaysZero: Boolean(screen.queryByText('0 créditos disponíveis')) }));
  expect(screen.queryByText('0 créditos disponíveis')).toBeNull();
});
