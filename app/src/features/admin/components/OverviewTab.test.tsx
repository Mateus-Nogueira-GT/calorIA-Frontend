import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { adminService } from '@shared/services/admin.service';
import { OverviewTab } from './OverviewTab';
import { MetricCard } from './MetricCard';

jest.mock('@shared/services/admin.service', () => ({ adminService: { overview: jest.fn() } }));
const overview = adminService.overview as jest.Mock;
const m = (value: number, previous = 0) => ({ value, previous });
const data = {
  periodDays: 30,
  users: {
    total: 120,
    newInPeriod: m(12, 10),
    active7d: 40,
    activeInPeriod: m(70, 70),
    withActiveDiet: 25,
  },
  usage: {
    photos: m(300, 250),
    textMessages: m(800),
    voiceMessages: m(90, 100),
    mealsLogged: m(1500),
    dietsCompleted: m(20),
    dietsFailed: m(1),
  },
  credits: {
    welcomeAutoUnits: m(750),
    welcomeInviteUnits: m(150),
    manualUnits: m(100),
    consumedPhotoUnits: m(4500),
    consumedMessageUnits: m(1600),
    totalBalanceUnits: 9000,
    zeroBalanceAccounts: 30,
  },
  invites: { created: m(10, 5), redeemed: m(4), redemptionRate: 0.4, expiredUnused: 2, revoked: 1 },
  ai: {
    byFeature: [
      { feature: 'chat', calls: 900, totalTokens: 2_000_000, estimatedUsd: 6.5 },
      { feature: 'speech', calls: 10, totalTokens: 400, estimatedUsd: null },
    ],
    totalEstimatedUsd: 6.5,
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  overview.mockResolvedValue(data);
});

it('payload de backend antigo, sem manualUnits, renderiza sem quebrar', async () => {
  const { manualUnits: _omit, ...credits } = data.credits;
  overview.mockResolvedValue({ ...data, credits });
  const screen = render(<OverviewTab />);
  await screen.findByText('Usuários');
  expect(screen.getByLabelText(/^Liberados manualmente: 0 créditos/)).toBeTruthy();
});

it('mostra os cinco blocos com comparação ao período anterior', async () => {
  const screen = render(<OverviewTab />);
  expect(overview).toHaveBeenCalledWith(30);
  await screen.findByText('Usuários');
  for (const title of ['Uso', 'Créditos', 'Convites', 'IA (custo estimado)'])
    expect(screen.getByText(title)).toBeTruthy();
  expect(screen.getByLabelText(/^Novas contas: 12, mais 20 por cento/)).toBeTruthy();
  expect(screen.getByLabelText(/^Mensagens de voz: 90, menos 10 por cento/)).toBeTruthy();
  expect(screen.getByLabelText(/^Boas-vindas automáticas: 150 créditos/)).toBeTruthy();
  expect(screen.getByText('40%')).toBeTruthy();
  expect(screen.getByText('sem preço')).toBeTruthy();
  expect(screen.getAllByText('US$ 6,50').length).toBeGreaterThan(0);
});

it('trocar o período refaz a consulta', async () => {
  const screen = render(<OverviewTab />);
  await screen.findByText('Usuários');
  fireEvent.press(screen.getByLabelText('Últimos 90 dias'));
  expect(overview).toHaveBeenLastCalledWith(90);
  fireEvent.press(screen.getByLabelText('Últimos 7 dias'));
  expect(overview).toHaveBeenLastCalledWith(7);
});

it('falha mostra erro com tentar de novo', async () => {
  overview.mockRejectedValueOnce(new Error('offline'));
  const screen = render(<OverviewTab />);
  await screen.findByText('Não foi possível carregar as métricas');
});

it('MetricCard sem período anterior avisa no rótulo acessível', () => {
  const screen = render(
    <MetricCard label="Fotos" value="5" compare={{ value: 5, previous: 0 }} width="100%" />,
  );
  expect(screen.getByLabelText('Fotos: 5, sem dados do período anterior')).toBeTruthy();
});
