import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { adminService } from '@shared/services/admin.service';
import { SEARCH_DEBOUNCE_MS, UsersTab } from './UsersTab';

jest.mock('@shared/services/admin.service', () => ({
  adminService: { users: jest.fn(), grantCredits: jest.fn(), setUnlimited: jest.fn() },
}));
const users = adminService.users as jest.Mock;
const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Pessoa ${id}`,
  email: `${id}@x.test`,
  created_at: '2026-10-01T12:00:00Z',
  last_activity_at: '2026-10-20T12:00:00Z',
  balance_units: 60,
  photos: 3,
  messages: 10,
  has_active_diet: true,
  current_streak: 4,
  joined_by_invite: false,
  unlimited: false,
  ...extra,
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  users.mockResolvedValue({ items: [row('a', { joined_by_invite: true })], next_cursor: null });
});
afterEach(() => jest.useRealTimers());

const flush = () => act(async () => {});

it('lista nome, e-mail, saldo em créditos e marcadores', async () => {
  const screen = render(<UsersTab />);
  await flush();
  expect(users).toHaveBeenCalledWith({ q: undefined, sort: 'recent', cursor: undefined, days: 30 });
  expect(screen.getByText('Pessoa a')).toBeTruthy();
  expect(screen.getByText('a@x.test')).toBeTruthy();
  expect(screen.getByText(/Saldo 12 créditos · 3 fotos · 10 mensagens em 30 dias/)).toBeTruthy();
  expect(screen.getByText(/Entrou por convite/)).toBeTruthy();
});

it('busca espera a digitação e só com 2 caracteres ou mais', async () => {
  const screen = render(<UsersTab />);
  await flush();
  users.mockClear();
  fireEvent.changeText(screen.getByLabelText('Buscar por nome ou e-mail'), 'b');
  await act(async () => {
    jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
  });
  expect(users).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText('Buscar por nome ou e-mail'), 'bru');
  await act(async () => {
    jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 50);
  });
  expect(users).not.toHaveBeenCalled();
  await act(async () => {
    jest.advanceTimersByTime(50);
  });
  expect(users).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'bru' }));
});

it('ordenação e paginação', async () => {
  users.mockResolvedValueOnce({ items: [row('a')], next_cursor: 'b146' });
  const screen = render(<UsersTab />);
  await flush();
  users.mockResolvedValueOnce({ items: [row('b')], next_cursor: null });
  fireEvent.press(screen.getByText('Ver mais usuários'));
  await flush();
  expect(users).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'b146' }));
  expect(screen.getByText('Pessoa a')).toBeTruthy();
  expect(screen.getByText('Pessoa b')).toBeTruthy();
  fireEvent.press(screen.getByText('Menor saldo'));
  await flush();
  expect(users).toHaveBeenLastCalledWith(
    expect.objectContaining({ sort: 'low_balance', cursor: undefined }),
  );
});

it('mostra o selo Ilimitado e abre o sheet ao tocar na linha', async () => {
  users.mockResolvedValue({ items: [row('a', { unlimited: true })], next_cursor: null });
  const screen = render(<UsersTab />);
  await flush();
  expect(screen.getByText('Ilimitado')).toBeTruthy();
  fireEvent.press(screen.getByText('Pessoa a'));
  expect(screen.getByText('Confirmar liberação')).toBeTruthy();
});

it('após liberar, a linha mostra o disponível (não o saldo total com reserva)', async () => {
  (adminService.grantCredits as jest.Mock).mockResolvedValue({
    balance_units: 400,
    available_units: 350,
    unlimited: false,
  });
  const screen = render(<UsersTab />);
  await flush();
  fireEvent.press(screen.getByText('Pessoa a'));
  fireEvent.press(screen.getByText('50'));
  fireEvent.press(screen.getByText('Confirmar liberação'));
  await flush();
  expect(screen.getByText(/Saldo 70 créditos/)).toBeTruthy();
  expect(screen.queryByText(/Saldo 80 créditos/)).toBeNull();
});
