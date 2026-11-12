import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { PackagesTab, parsePriceToCents } from './PackagesTab';
import { adminService } from '@shared/services/admin.service';

jest.mock('@shared/services/admin.service', () => ({
  ...jest.requireActual('@shared/services/admin.service'),
  adminService: {
    creditPackages: jest.fn(),
    createCreditPackage: jest.fn(),
    updateCreditPackage: jest.fn(),
  },
}));
const svc = adminService as jest.Mocked<typeof adminService>;

beforeEach(() => {
  jest.clearAllMocks();
  svc.creditPackages.mockResolvedValue([
    {
      id: 'k1',
      code: 'pacote-10',
      name: '10 créditos',
      credits: 10,
      price_cents: 6000,
      active: true,
      sort_order: 0,
    },
  ]);
  svc.createCreditPackage.mockResolvedValue({} as never);
  svc.updateCreditPackage.mockResolvedValue({} as never);
});

it('converte o preço digitado em centavos', () => {
  expect(parsePriceToCents('60')).toBe(6000);
  expect(parsePriceToCents('60,50')).toBe(6050);
  expect(parsePriceToCents('R$ 1.234,56')).toBe(123456);
  expect(parsePriceToCents('abc')).toBeNull();
});

it('cria pacote com preço por crédito calculado', async () => {
  const screen = render(<PackagesTab />);
  expect(await screen.findByText('10 créditos · R$ 60,00')).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('Créditos'), '25');
  fireEvent.changeText(screen.getByLabelText('Preço (R$)'), '150');
  expect(screen.getByText('R$ 6,00 por crédito')).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getByText('Criar pacote'));
  });
  expect(svc.createCreditPackage).toHaveBeenCalledWith({
    code: 'pacote-25',
    name: '25 créditos',
    credits: 25,
    price_cents: 15000,
  });
});

it('tira um pacote de venda', async () => {
  const screen = render(<PackagesTab />);
  await screen.findByText('10 créditos · R$ 60,00');
  await act(async () => {
    fireEvent.press(screen.getByText('Tirar de venda'));
  });
  expect(svc.updateCreditPackage).toHaveBeenCalledWith('k1', { active: false });
});
