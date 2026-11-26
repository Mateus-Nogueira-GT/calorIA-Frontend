import { AppState } from 'react-native';
import { refreshWalletOnForeground, useCreditsStore } from './store';
import { useAuthStore } from '@features/auth/store';
import { creditsService, Wallet } from '@shared/services/credits.service';
jest.mock('@shared/services/credits.service', () => ({
  creditsService: { wallet: jest.fn() },
  subscribeCreditChange: jest.fn(),
}));
const wallet: Wallet = {
  balance_units: 75,
  reserved_units: 0,
  available_units: 75,
  units_per_credit: 5,
  enforcement_enabled: false,
  invites_enabled: false,
  policy: { photo_units: 15, message_units: 1, welcome_units: 75, version: 'test' },
};
const read = creditsService.wallet as jest.Mock;
// Capturado antes do clearAllMocks: o store registra o listener ao ser importado.
const appStateListeners = (AppState.addEventListener as jest.Mock).mock.calls.map(
  ([, cb]) => cb as unknown,
);
beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({
    sessionGeneration: 50,
    isAuthenticated: true,
    user: { id: 'a', name: 'Ana', email: 'ana@example.test' },
  });
  useCreditsStore.getState().clear();
});
it('discards the old account wallet arriving after logout', async () => {
  let resolve!: (value: Wallet) => void;
  read.mockReturnValueOnce(
    new Promise<Wallet>((r) => {
      resolve = r;
    }),
  );
  const request = useCreditsStore.getState().load();
  useAuthStore.setState({ sessionGeneration: 51, isAuthenticated: false, user: null });
  resolve(wallet);
  await request;
  expect(useCreditsStore.getState()).toMatchObject({ wallet: null, loading: false, error: null });
});
it('most recent wallet refresh wins when responses arrive out of order', async () => {
  let resolve!: (value: Wallet) => void;
  read
    .mockReturnValueOnce(
      new Promise<Wallet>((r) => {
        resolve = r;
      }),
    )
    .mockResolvedValueOnce({ ...wallet, available_units: 60 });
  const first = useCreditsStore.getState().load();
  await useCreditsStore.getState().load();
  resolve(wallet);
  await first;
  expect(useCreditsStore.getState().wallet?.available_units).toBe(60);
});
it('provider error is unavailable balance rather than a fabricated zero', async () => {
  read.mockRejectedValueOnce(new Error('offline'));
  await useCreditsStore.getState().load();
  expect(useCreditsStore.getState()).toMatchObject({
    wallet: null,
    loading: false,
    error: 'Não foi possível consultar seu saldo.',
  });
});

describe('R5: volta ao app', () => {
  it('o store escuta o AppState uma vez, para todas as telas', () => {
    expect(appStateListeners.filter((cb) => cb === refreshWalletOnForeground)).toHaveLength(1);
  });

  it('background → active recarrega a carteira quando os créditos estão visíveis', async () => {
    read.mockResolvedValue({ ...wallet, enforcement_enabled: true });
    await useCreditsStore.getState().load();
    expect(read).toHaveBeenCalledTimes(1);
    refreshWalletOnForeground('background');
    refreshWalletOnForeground('active');
    await Promise.resolve();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('créditos desligados ou sem sessão: voltar ao app não consulta', async () => {
    read.mockResolvedValue(wallet);
    await useCreditsStore.getState().load();
    refreshWalletOnForeground('active');
    expect(read).toHaveBeenCalledTimes(1);

    useCreditsStore.setState({ featureVisible: true });
    useAuthStore.setState({ isAuthenticated: false, user: null });
    refreshWalletOnForeground('active');
    expect(read).toHaveBeenCalledTimes(1);
  });
});
