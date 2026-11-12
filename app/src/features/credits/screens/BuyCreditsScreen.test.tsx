import React from 'react';
import { Linking } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { BuyCreditsScreen, POLL_INTERVAL_MS } from './BuyCreditsScreen';
import { purchasesService } from '@shared/services/purchases.service';
import { notifyCreditChange } from '@shared/services/credits.service';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }),
}));
jest.mock('@shared/services/purchases.service', () => ({
  ...jest.requireActual('@shared/services/purchases.service'),
  purchasesService: {
    packages: jest.fn(),
    hasCustomer: jest.fn(),
    checkout: jest.fn(),
    get: jest.fn(),
  },
}));
jest.mock('@shared/services/credits.service', () => ({
  ...jest.requireActual('@shared/services/credits.service'),
  notifyCreditChange: jest.fn(),
}));

const svc = purchasesService as jest.Mocked<typeof purchasesService>;
const PKG = { code: 'pacote-10', name: '10 créditos', credits: 10, price_cents: 6000 };

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  svc.packages.mockResolvedValue([PKG]);
  svc.checkout.mockResolvedValue({
    purchase_id: 'p1',
    status: 'pending',
    invoice_url: 'https://asaas/i/1',
  });
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});
afterEach(() => {
  jest.useRealTimers();
});

it('primeira compra pede nome e CPF, abre a fatura e confirma os créditos', async () => {
  svc.hasCustomer.mockResolvedValue(false);
  svc.get.mockResolvedValueOnce({
    id: 'p1',
    status: 'pending',
    credits: 10,
    price_cents: 6000,
    invoice_url: 'x',
  });
  svc.get.mockResolvedValueOnce({
    id: 'p1',
    status: 'paid',
    credits: 10,
    price_cents: 6000,
    invoice_url: null,
  });
  const screen = render(<BuyCreditsScreen />);
  expect(await screen.findByText('R$ 6,00 por crédito')).toBeTruthy();

  fireEvent.press(screen.getByLabelText('10 créditos por R$ 60,00'));
  expect(svc.checkout).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText('Nome completo'), 'Ana Souza');
  fireEvent.changeText(screen.getByLabelText('CPF ou CNPJ'), '52998224725');
  expect(screen.getByDisplayValue('529.982.247-25')).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getByText('Pagar R$ 60,00'));
  });

  expect(svc.checkout).toHaveBeenCalledWith({
    package_code: 'pacote-10',
    cpf_cnpj: '529.982.247-25',
    name: 'Ana Souza',
  });
  expect(Linking.openURL).toHaveBeenCalledWith('https://asaas/i/1');
  expect(screen.getByText('Aguardando o pagamento')).toBeTruthy();

  await act(async () => {
    jest.advanceTimersByTime(POLL_INTERVAL_MS);
  });
  await act(async () => {
    jest.advanceTimersByTime(POLL_INTERVAL_MS);
  });
  expect(await screen.findByText('Pronto!')).toBeTruthy();
  expect(notifyCreditChange).toHaveBeenCalled();
});

it('compra seguinte vai direto para o pagamento, sem pedir CPF', async () => {
  svc.hasCustomer.mockResolvedValue(true);
  const screen = render(<BuyCreditsScreen />);
  await screen.findByText('R$ 6,00 por crédito');
  await act(async () => {
    fireEvent.press(screen.getByLabelText('10 créditos por R$ 60,00'));
  });
  expect(screen.queryByLabelText('CPF ou CNPJ')).toBeNull();
  expect(svc.checkout).toHaveBeenCalledWith({ package_code: 'pacote-10' });
});

it('CPF inválido no servidor mostra o motivo e mantém o formulário', async () => {
  svc.hasCustomer.mockResolvedValue(false);
  svc.checkout.mockRejectedValue({
    response: { status: 422, data: { error: 'INVALID_DOCUMENT' } },
  });
  const screen = render(<BuyCreditsScreen />);
  await screen.findByText('R$ 6,00 por crédito');
  fireEvent.press(screen.getByLabelText('10 créditos por R$ 60,00'));
  fireEvent.changeText(screen.getByLabelText('Nome completo'), 'Ana');
  fireEvent.changeText(screen.getByLabelText('CPF ou CNPJ'), '11111111111');
  await act(async () => {
    fireEvent.press(screen.getByText('Pagar R$ 60,00'));
  });
  expect(screen.getByText('Confira o CPF ou CNPJ informado.')).toBeTruthy();
  expect(screen.getByLabelText('CPF ou CNPJ')).toBeTruthy();
  expect(Linking.openURL).not.toHaveBeenCalled();
});

it('recarga desligada no servidor: avisa que ainda não está disponível', async () => {
  svc.packages.mockRejectedValue({ response: { status: 404, data: { error: 'NOT_FOUND' } } });
  svc.hasCustomer.mockResolvedValue(false);
  const screen = render(<BuyCreditsScreen />);
  expect(await screen.findByText('A compra de créditos ainda não está disponível.')).toBeTruthy();
});
