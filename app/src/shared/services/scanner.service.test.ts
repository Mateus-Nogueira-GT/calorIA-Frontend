import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('./api', () => ({ __esModule: true, default: { post: jest.fn() } }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('./api').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { scannerService } = require('./scanner.service');

describe('scannerService.analyzePhoto', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retorna a lista de itens', async () => {
    api.post.mockResolvedValue({ data: { items: [{ id: '1', name: 'Arroz', calories: 200, protein: 4, carbs: 44, fat: 1, confidence: 0.9 }] } });
    const res = await scannerService.analyzePhoto('data:image/jpeg;base64,AAA');
    expect(res.items).toHaveLength(1);
    expect(res.items[0].name).toBe('Arroz');
  });

  it('normaliza resposta de item único para { items: [...] }', async () => {
    api.post.mockResolvedValue({ data: { name: 'Banana', calories: 90, protein: 1, carbs: 23, fat: 0, confidence: 0.8 } });
    const res = await scannerService.analyzePhoto('data:image/jpeg;base64,AAA');
    expect(res.items).toHaveLength(1);
    expect(res.items[0].name).toBe('Banana');
    expect(res.items[0].id).toBeTruthy();
  });
});
