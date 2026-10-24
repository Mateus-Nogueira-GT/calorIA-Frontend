import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { adminService, AdminUserRow } from '@shared/services/admin.service';
import { UserCreditsSheet } from './UserCreditsSheet';

jest.mock('@shared/services/admin.service', () => ({
  adminService: { grantCredits: jest.fn(), setUnlimited: jest.fn() },
}));
const grant = adminService.grantCredits as jest.Mock;
const setUnlimited = adminService.setUnlimited as jest.Mock;
const user = { id: 'u1', name: 'Ana', email: 'a@x.test', unlimited: false } as AdminUserRow;
const flush = () => act(async () => {});
const setup = () => {
  const onClose = jest.fn();
  const onUpdated = jest.fn();
  const screen = render(<UserCreditsSheet user={user} onClose={onClose} onUpdated={onUpdated} />);
  return { screen, onClose, onUpdated };
};

beforeEach(() => {
  jest.clearAllMocks();
  grant.mockResolvedValue({ balance_units: 310, available_units: 310, unlimited: false });
  setUnlimited.mockResolvedValue({ unlimited: true });
});

it('libera 50 créditos uma vez, mesmo com dois toques, e fecha', async () => {
  let release: (v: unknown) => void = () => {};
  grant.mockReturnValue(new Promise((r) => (release = r)));
  const { screen, onClose, onUpdated } = setup();
  fireEvent.press(screen.getByText('50'));
  const confirm = screen.getByText('Confirmar liberação');
  fireEvent.press(confirm);
  fireEvent.press(confirm);
  await act(async () => release({ balance_units: 310, available_units: 310, unlimited: false }));
  expect(grant).toHaveBeenCalledTimes(1);
  expect(grant).toHaveBeenCalledWith(
    'u1',
    50,
    undefined,
    expect.stringMatching(/^[A-Za-z0-9_-]{16,128}$/),
  );
  expect(onUpdated).toHaveBeenCalledWith({ balance_units: 310, unlimited: false });
  expect(onClose).toHaveBeenCalled();
});

it.each(['0', '1001'])('recusa %s no campo livre', async (value) => {
  const { screen } = setup();
  fireEvent.changeText(screen.getByLabelText('Quantidade de créditos'), value);
  fireEvent.press(screen.getByText('Confirmar liberação'));
  await flush();
  expect(screen.getAllByText('Informe de 1 a 1.000 créditos').length).toBeGreaterThan(0);
  expect(grant).not.toHaveBeenCalled();
});

it('credita 15 pelo atalho', async () => {
  const { screen } = setup();
  fireEvent.press(screen.getByText('15'));
  fireEvent.press(screen.getByText('Confirmar liberação'));
  await flush();
  expect(grant).toHaveBeenCalledWith('u1', 15, undefined, expect.any(String));
});

it('nova tentativa após falha reaproveita a mesma chave', async () => {
  grant.mockRejectedValueOnce(new Error('offline'));
  const { screen } = setup();
  fireEvent.press(screen.getByText('15'));
  fireEvent.press(screen.getByText('Confirmar liberação'));
  await flush();
  expect(screen.getByText('Não foi possível liberar os créditos. Tente novamente.')).toBeTruthy();
  fireEvent.press(screen.getByText('Confirmar liberação'));
  await flush();
  expect(grant.mock.calls[1][3]).toBe(grant.mock.calls[0][3]);
});

it('mostra a mensagem de conflito de idempotência', async () => {
  grant.mockRejectedValueOnce({ response: { data: { error: 'IDEMPOTENCY_CONFLICT' } } });
  const { screen } = setup();
  fireEvent.press(screen.getByText('15'));
  fireEvent.press(screen.getByText('Confirmar liberação'));
  await flush();
  expect(
    screen.getByText('Esta liberação já foi registrada com outros dados. Feche e tente de novo.'),
  ).toBeTruthy();
});

it('o switch Acesso ilimitado chama setUnlimited', async () => {
  const { screen, onUpdated } = setup();
  fireEvent(screen.getByLabelText('Acesso ilimitado'), 'valueChange', true);
  await flush();
  expect(setUnlimited).toHaveBeenCalledWith('u1', true);
  expect(onUpdated).toHaveBeenCalledWith({ unlimited: true });
});
