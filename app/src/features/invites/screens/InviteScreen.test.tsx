import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { InviteScreen } from './InviteScreen';
import api from '@shared/services/api';
import { useAuthStore } from '@features/auth/store';

const mockLoadCredits = jest.fn().mockResolvedValue(undefined);
jest.mock('@shared/services/api', () => ({ __esModule: true, default: { post: jest.fn() } }));
jest.mock('@features/credits/store', () => ({
  useCreditsStore: { getState: () => ({ load: mockLoadCredits }) },
}));
const post = api.post as jest.Mock;
const token = 'a'.repeat(43);
const preview = { data: { grant_units: 75, expires_at: '2026-10-22T12:00:00Z' } };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({
    sessionGeneration: 10,
    isAuthenticated: true,
    user: { id: 'a', name: 'Ana', email: 'ana@example.test' },
  });
  post.mockResolvedValue(preview);
});
const props = () => ({ token, onAuthenticate: jest.fn(), onDone: jest.fn() });
it('preview does not redeem and asks the signed-out user to authenticate', async () => {
  useAuthStore.setState({ isAuthenticated: false, user: null });
  const handlers = props();
  const screen = render(<InviteScreen {...handlers} />);
  fireEvent.press(await screen.findByText('Entrar ou criar conta'));
  expect(handlers.onAuthenticate).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith('/credit-invites/preview', { token });
});
it.each(['expired', 'revoked'])('%s invite never offers redemption', async () => {
  post.mockRejectedValueOnce({ response: { status: 410 } });
  const screen = render(<InviteScreen {...props()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(/indisponível/);
  expect(screen.queryByText('Confirmar e receber créditos')).toBeNull();
  expect(post).toHaveBeenCalledTimes(1);
});
it('double tap produces one claim and idempotent replay does not announce a new grant', async () => {
  const pending = deferred<{ data: { granted: boolean } }>();
  post.mockImplementation((path: string) =>
    path.endsWith('preview') ? Promise.resolve(preview) : pending.promise,
  );
  const screen = render(<InviteScreen {...props()} />);
  const button = await screen.findByText('Confirmar e receber créditos');
  act(() => {
    fireEvent.press(button);
    fireEvent.press(button);
  });
  expect(post.mock.calls.filter(([path]) => path.endsWith('redeem'))).toHaveLength(1);
  await act(async () => pending.resolve({ data: { granted: false } }));
  expect(await screen.findByText(/já foram confirmados/)).toBeTruthy();
  expect(mockLoadCredits).toHaveBeenCalledTimes(1);
});
it('changing token clears success and ignores a prior preview response', async () => {
  const oldPreview = deferred<typeof preview>();
  post.mockReturnValueOnce(oldPreview.promise).mockResolvedValue(preview);
  const handlers = props();
  const screen = render(<InviteScreen {...handlers} />);
  screen.rerender(<InviteScreen {...handlers} token={'b'.repeat(43)} />);
  await screen.findByText('Confirmar e receber créditos');
  await act(async () =>
    oldPreview.resolve({ data: { grant_units: 5, expires_at: '2026-10-22T12:00:00Z' } }),
  );
  expect(
    screen.getByText('15 créditos de boas-vindas para experimentar o aplicativo.'),
  ).toBeTruthy();
});
it('a response from the old account cannot confirm redemption in the next account', async () => {
  const pending = deferred<{ data: { granted: boolean } }>();
  post.mockImplementation((path: string) =>
    path.endsWith('preview') ? Promise.resolve(preview) : pending.promise,
  );
  const screen = render(<InviteScreen {...props()} />);
  fireEvent.press(await screen.findByText('Confirmar e receber créditos'));
  act(() =>
    useAuthStore.setState({
      sessionGeneration: 11,
      user: { id: 'b', name: 'Bia', email: 'bia@example.test' },
    }),
  );
  await act(async () => pending.resolve({ data: { granted: true } }));
  await waitFor(() => expect(screen.queryByText(/confirmados na sua conta/)).toBeNull());
  expect(mockLoadCredits).not.toHaveBeenCalled();
});
it('already welcomed account gets an actionable message without consuming the other invite', async () => {
  post.mockImplementation((path: string) =>
    path.endsWith('preview')
      ? Promise.resolve(preview)
      : Promise.reject({ response: { data: { error: 'WELCOME_ALREADY_CLAIMED' } } }),
  );
  const screen = render(<InviteScreen {...props()} />);
  fireEvent.press(await screen.findByText('Confirmar e receber créditos'));
  expect(
    await screen.findByText(/convite continua disponível para outra conta elegível/),
  ).toBeTruthy();
});
it('convite revogado, expirado ou já usado não manda tentar de novo', async () => {
  post.mockImplementation((path: string) =>
    path.endsWith('preview')
      ? Promise.resolve(preview)
      : Promise.reject({ response: { status: 410, data: { error: 'INVITE_UNAVAILABLE' } } }),
  );
  const screen = render(<InviteScreen {...props()} />);
  fireEvent.press(await screen.findByText('Confirmar e receber créditos'));
  expect(await screen.findByText(/não está mais disponível/)).toBeTruthy();
  expect(screen.queryByText(/Tente novamente/)).toBeNull();
});

const claimButton = (screen: ReturnType<typeof render>) =>
  screen.queryByRole('button', { name: 'Confirmar e receber créditos' });
const isActionable = (button: ReturnType<typeof claimButton>) =>
  Boolean(button && !button.props.accessibilityState?.disabled);
const redeemRejects = (error: unknown) =>
  post.mockImplementation((path: string) =>
    path.endsWith('preview') ? Promise.resolve(preview) : Promise.reject(error),
  );

it('D08: convite indisponível no resgate não deixa o botão de resgate ativo', async () => {
  redeemRejects({ response: { status: 410, data: { error: 'INVITE_UNAVAILABLE' } } });
  const screen = render(<InviteScreen {...props()} />);
  fireEvent.press(await screen.findByText('Confirmar e receber créditos'));
  await screen.findByText(/não está mais disponível/);
  expect(isActionable(claimButton(screen))).toBe(false);
  expect(screen.getByText('Conferir convite')).toBeTruthy();
});

it('D08: conta que já recebeu as boas-vindas não pode repetir o resgate, mas pode trocar de conta', async () => {
  redeemRejects({ response: { status: 409, data: { error: 'WELCOME_ALREADY_CLAIMED' } } });
  const screen = render(<InviteScreen {...props()} />);
  fireEvent.press(await screen.findByText('Confirmar e receber créditos'));
  await screen.findByText(/convite continua disponível para outra conta elegível/);
  expect(isActionable(claimButton(screen))).toBe(false);
  expect(screen.getByText('Usar outra conta')).toBeTruthy();
});

it('D08: falha de rede mantém o resgate disponível para nova tentativa', async () => {
  redeemRejects(new Error('offline'));
  const screen = render(<InviteScreen {...props()} />);
  fireEvent.press(await screen.findByText('Confirmar e receber créditos'));
  await screen.findByText(/Tente novamente para confirmar/);
  await waitFor(() => expect(isActionable(claimButton(screen))).toBe(true));
});
