import { describe, it, expect, jest } from '@jest/globals';

jest.mock('./api', () => ({ __esModule: true, default: { patch: jest.fn(), post: jest.fn(), get: jest.fn() } }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('./api').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { foodLogService } = require('./food-log.service');

describe('foodLogService.updateMeal', () => {
  it('faz PATCH em /food-log/:id e devolve a refeição', async () => {
    api.patch.mockResolvedValue({ data: { id: 'm1' } });
    const data = { name: 'Arroz', calories: 150, protein: 4, carbs: 30, fat: 1, fiber: null, mealType: 'lunch' };
    await expect(foodLogService.updateMeal('m1', data)).resolves.toEqual({ id: 'm1' });
    expect(api.patch).toHaveBeenCalledWith('/food-log/m1', data);
  });
});

describe('foodLogService.addMeal — Idempotency-Key (C4)', () => {
  const data = { name: 'Arroz', calories: 150, protein: 4, carbs: 30, fat: 1, mealType: 'lunch', date: '2026-11-26' };

  it('com chave: manda o cabeçalho junto da config do dono da sessão', async () => {
    api.post.mockResolvedValue({ data: { id: 'm1' } });
    const owner = { userId: 'u1', generation: 1 };
    await foodLogService.addMeal(data, owner, 'card-0123456789abcdef');
    const config = api.post.mock.calls[0][2];
    expect(config.headers).toEqual({ 'Idempotency-Key': 'card-0123456789abcdef' });
    expect(config.caloriaOwner).toBe(owner);
    expect(config.signal).toBeDefined();
  });

  it('sem chave: a chamada continua como antes, sem cabeçalho', async () => {
    api.post.mockReset();
    api.post.mockResolvedValue({ data: { id: 'm1' } });
    await foodLogService.addMeal(data);
    expect(api.post).toHaveBeenCalledWith('/food-log', data, undefined);
  });
});

describe('foodLogService.getSummary — S9', () => {
  it('manda o fuso local: o servidor data as refeições do plano concluídas como o Dashboard', async () => {
    api.get.mockResolvedValue({ data: [] });
    await foodLogService.getSummary('2026-11-20', '2026-11-26');
    expect(api.get).toHaveBeenCalledWith('/food-log/summary', {
      params: { from: '2026-11-20', to: '2026-11-26', tzOffsetMinutes: -new Date().getTimezoneOffset() },
    });
  });
});
