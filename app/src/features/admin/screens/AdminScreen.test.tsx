import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AdminScreen } from './AdminScreen';
import { adminService } from '@shared/services/admin.service';
import { profileService } from '@shared/services/profile.service';
import { useAuthStore } from '@features/auth/store';

let mockFocused = true;
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void) => {
    const ReactHooks = jest.requireActual('react');
    const focused = mockFocused;
    ReactHooks.useEffect(() => {
      if (focused) return effect();
    }, [effect, focused]);
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }),
}));
jest.mock('@shared/services/admin.service', () => ({
  adminService: {
    invites: jest.fn(),
    createInvite: jest.fn(),
    revokeInvite: jest.fn(),
    overview: jest.fn(() => new Promise(() => {})),
    users: jest.fn(() => new Promise(() => {})),
  },
}));
jest.mock('@shared/services/profile.service', () => ({ profileService: { getMe: jest.fn() } }));
const getMe = profileService.getMe as jest.Mock;
const list = adminService.invites as jest.Mock;
const create = adminService.createInvite as jest.Mock;
const revoke = adminService.revokeInvite as jest.Mock;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const invite = {
  id: 'i1',
  label: 'Convite Rafael',
  status: 'active',
  grant_units: 75,
  expires_at: '2026-10-22T12:00:00Z',
};
beforeEach(() => {
  jest.clearAllMocks();
  mockFocused = true;
  useAuthStore.setState({
    sessionGeneration: 20,
    isAuthenticated: true,
    user: { id: 'admin', name: 'Admin', email: 'admin@example.test' },
  });
  getMe.mockResolvedValue({ is_admin: true });
  list.mockResolvedValue({ items: [invite], next_cursor: null });
  create.mockResolvedValue({ ...invite, url: null });
  revoke.mockResolvedValue({ ...invite, status: 'revoked' });
});
it('nonadmin cannot list or create invites', async () => {
  getMe.mockResolvedValue({ is_admin: false });
  const screen = render(<AdminScreen initialTab="invites" />);
  await screen.findByText('Esta área está disponível somente para administradores.');
  expect(screen.queryByText('Gerar convite')).toBeNull();
  expect(list).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
});
it('double tap creates once and lost response retry keeps the same idempotency key', async () => {
  const pending = deferred<{ url: null }>();
  create.mockReturnValueOnce(pending.promise).mockResolvedValue({ ...invite, url: null });
  const screen = render(<AdminScreen initialTab="invites" />);
  const button = await screen.findByText('Gerar convite');
  act(() => {
    fireEvent.press(button);
    fireEvent.press(button);
  });
  expect(create).toHaveBeenCalledTimes(1);
  // Resolve the ambiguous first response as an idempotent replay: link is not recoverable.
  await act(async () => pending.resolve({ ...invite, url: null }));
  expect(await screen.findByText(/Se perdeu o link, revogue-o na lista e gere outro/)).toBeTruthy();
  expect(screen.queryByText('Compartilhar link')).toBeNull();
});
it('retry after network failure reuses request key and does not silently issue another invite', async () => {
  create
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValueOnce({ ...invite, url: null });
  const screen = render(<AdminScreen initialTab="invites" />);
  fireEvent.press(await screen.findByText('Gerar convite'));
  await screen.findByText(/Não foi possível confirmar a emissão/);
  fireEvent.press(screen.getByText('Gerar convite'));
  await screen.findByText(/Este convite já foi emitido/);
  expect(create.mock.calls[0][1]).toBe(create.mock.calls[1][1]);
});
it('expired and revoked links have no revoke action', async () => {
  list.mockResolvedValue({
    items: [
      { ...invite, id: 'expired', status: 'expired' },
      { ...invite, id: 'revoked', status: 'revoked' },
    ],
    next_cursor: null,
  });
  const screen = render(<AdminScreen initialTab="invites" />);
  await screen.findByText(/Expirado/);
  expect(screen.getByText(/Revogado/)).toBeTruthy();
  expect(screen.queryByText('Revogar convite')).toBeNull();
});
it('a subsequent permission failure hides stale list and issue controls', async () => {
  list
    .mockResolvedValueOnce({ items: [invite], next_cursor: 'next' })
    .mockRejectedValueOnce({ response: { status: 404 } });
  const screen = render(<AdminScreen initialTab="invites" />);
  fireEvent.press(await screen.findByText('Ver mais convites'));
  await screen.findByText('Convites indisponíveis ou acesso revogado.');
  expect(screen.queryByText(/Convite Rafael/)).toBeNull();
  expect(screen.queryByText('Gerar convite')).toBeNull();
});
it('late creation cannot display a bearer link in the next session', async () => {
  const pending = deferred<{ url: string }>();
  create.mockReturnValueOnce(pending.promise);
  const screen = render(<AdminScreen initialTab="invites" />);
  fireEvent.press(await screen.findByText('Gerar convite'));
  getMe.mockResolvedValue({ is_admin: false });
  act(() =>
    useAuthStore.setState({
      sessionGeneration: 21,
      user: { id: 'other', name: 'Outro', email: 'other@example.test' },
    }),
  );
  await act(async () => pending.resolve({ url: 'https://example.test/convite#test-fixture' }));
  await waitFor(() =>
    expect(screen.queryByText('https://example.test/convite#test-fixture')).toBeNull(),
  );
  expect(screen.queryByText('Gerar convite')).toBeNull();
});

it('blur cancels local display rights without trapping creation when focused again', async () => {
  const first = deferred<{ url: string }>();
  create.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ ...invite, url: null });
  const screen = render(<AdminScreen initialTab="invites" />);
  fireEvent.press(await screen.findByText('Gerar convite'));
  mockFocused = false;
  screen.rerender(<AdminScreen initialTab="invites" />);
  mockFocused = true;
  screen.rerender(<AdminScreen initialTab="invites" />);
  fireEvent.press(await screen.findByText('Gerar convite'));
  await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
  await act(async () => first.resolve({ url: 'https://example.test/convite#old-focus-fixture' }));
  expect(screen.queryByText('https://example.test/convite#old-focus-fixture')).toBeNull();
  expect(create.mock.calls[0][1]).toBe(create.mock.calls[1][1]);
});

it('abre na visão geral e troca de aba', async () => {
  const screen = render(<AdminScreen />);
  await screen.findByText('Carregando métricas…');
  expect(screen.queryByText('Gerar convite')).toBeNull();
  fireEvent.press(screen.getByRole('tab', { name: 'Convites' }));
  expect(await screen.findByText('Gerar convite')).toBeTruthy();
  fireEvent.press(screen.getByRole('tab', { name: 'Usuários' }));
  expect(screen.getByLabelText('Buscar por nome ou e-mail')).toBeTruthy();
});

it('convites desligados não escondem as métricas', async () => {
  list.mockRejectedValueOnce({ response: { status: 404 } });
  const screen = render(<AdminScreen />);
  await screen.findByText('Carregando métricas…');
  expect(screen.queryByText('Esta área está disponível somente para administradores.')).toBeNull();
  fireEvent.press(screen.getByRole('tab', { name: 'Convites' }));
  expect(await screen.findByText('Convites indisponíveis ou acesso revogado.')).toBeTruthy();
});

it('convite resgatado mostra quem resgatou e o uso depois', async () => {
  list.mockResolvedValue({
    items: [
      {
        ...invite,
        id: 'u1',
        status: 'used',
        created_at: '2026-10-10T12:00:00Z',
        claimed_by: 'b',
        claimed_by_name: 'Bruna',
        claimed_by_email: 'bruna@x.test',
        claimed_at: '2026-10-12T12:00:00Z',
        usage_since_claim: { debited_units: 30, photos: 2, messages: 0 },
      },
    ],
    next_cursor: null,
  });
  const screen = render(<AdminScreen initialTab="invites" />);
  expect(await screen.findByText(/Resgatado por Bruna \(bruna@x.test\)/)).toBeTruthy();
  expect(
    screen.getByText(/Depois do resgate: 6 créditos usados · 2 fotos · 0 mensagens/),
  ).toBeTruthy();
});

it('gerar outro com a mesma identificação usa o rótulo do item e uma chave nova', async () => {
  const screen = render(<AdminScreen initialTab="invites" />);
  fireEvent.press(await screen.findByText('Gerar outro com a mesma identificação'));
  await waitFor(() => expect(create).toHaveBeenCalledWith('Convite Rafael', expect.any(String)));
});
