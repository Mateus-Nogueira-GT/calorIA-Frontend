import { describe, it, expect, jest } from '@jest/globals';
import { todayString } from '@shared/utils/date';

jest.mock('./api', () => ({ __esModule: true, default: { patch: jest.fn() } }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('./api').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { dietService } = require('./diet.service');

describe('dietService.toggleMeal', () => {
  it('sem data, marca o dia de hoje', async () => {
    api.patch.mockResolvedValue({ data: { is_completed: true } });
    await dietService.toggleMeal('pm1');
    expect(api.patch).toHaveBeenLastCalledWith(
      '/diets/meals/pm1/toggle',
      expect.objectContaining({ date: todayString() }),
    );
  });

  it('com a data do cartão do coach (C7), marca aquele dia', async () => {
    api.patch.mockResolvedValue({ data: { is_completed: true } });
    await dietService.toggleMeal('pm1', { completed: true, date: '2026-11-23' });
    expect(api.patch).toHaveBeenLastCalledWith(
      '/diets/meals/pm1/toggle',
      expect.objectContaining({ date: '2026-11-23', completed: true }),
    );
  });
});
