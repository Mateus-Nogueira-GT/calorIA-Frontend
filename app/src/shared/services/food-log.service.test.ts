import { describe, it, expect, jest } from '@jest/globals';

jest.mock('./api', () => ({ __esModule: true, default: { patch: jest.fn() } }));
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
