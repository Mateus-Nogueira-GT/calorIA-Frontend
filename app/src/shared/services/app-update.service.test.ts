import * as Updates from 'expo-updates';
import { applyPendingUpdate } from './app-update.service';

jest.mock('expo-updates', () => ({
  isEnabled: true,
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
}));

const check = Updates.checkForUpdateAsync as jest.Mock;
const fetchUpdate = Updates.fetchUpdateAsync as jest.Mock;
const reload = Updates.reloadAsync as jest.Mock;
const realDev = (global as { __DEV__?: boolean }).__DEV__;

beforeEach(() => {
  jest.clearAllMocks();
  (global as { __DEV__?: boolean }).__DEV__ = false;
  check.mockResolvedValue({ isAvailable: true });
  fetchUpdate.mockResolvedValue({ isNew: true });
  reload.mockResolvedValue(undefined);
});
afterAll(() => {
  (global as { __DEV__?: boolean }).__DEV__ = realDev;
});

it('atualização nova encontrada na abertura: baixa e recarrega na hora', async () => {
  await expect(applyPendingUpdate()).resolves.toBe(true);
  expect(fetchUpdate).toHaveBeenCalled();
  expect(reload).toHaveBeenCalledTimes(1);
});

it('sem atualização: não baixa nem recarrega', async () => {
  check.mockResolvedValue({ isAvailable: false });
  await expect(applyPendingUpdate()).resolves.toBe(false);
  expect(fetchUpdate).not.toHaveBeenCalled();
  expect(reload).not.toHaveBeenCalled();
});

it('download terminou depois da janela: não recarrega no meio do uso', async () => {
  const now = jest.spyOn(Date, 'now');
  now.mockReturnValueOnce(0).mockReturnValueOnce(1000).mockReturnValue(10_000);
  await expect(applyPendingUpdate(6000)).resolves.toBe(false);
  expect(fetchUpdate).toHaveBeenCalled();
  expect(reload).not.toHaveBeenCalled();
  now.mockRestore();
});

it('erro de rede: segue com a versão atual', async () => {
  check.mockRejectedValue(new Error('offline'));
  await expect(applyPendingUpdate()).resolves.toBe(false);
  expect(reload).not.toHaveBeenCalled();
});

it('chamadas simultâneas fazem uma única verificação', async () => {
  await Promise.all([applyPendingUpdate(), applyPendingUpdate()]);
  expect(check).toHaveBeenCalledTimes(1);
});

it('em desenvolvimento não faz nada', async () => {
  (global as { __DEV__?: boolean }).__DEV__ = true;
  await expect(applyPendingUpdate()).resolves.toBe(false);
  expect(check).not.toHaveBeenCalled();
});
