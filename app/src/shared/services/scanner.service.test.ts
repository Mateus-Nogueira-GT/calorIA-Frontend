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
    api.post.mockResolvedValue({
      data: {
        items: [
          { id: '1', name: 'Arroz', calories: 200, protein: 4, carbs: 44, fat: 1, confidence: 0.9 },
        ],
      },
    });
    const res = await scannerService.analyzePhoto('data:image/jpeg;base64,AAA');
    expect(res.items).toHaveLength(1);
    expect(res.items[0].name).toBe('Arroz');
  });

  it('normaliza resposta de item único para { items: [...] }', async () => {
    api.post.mockResolvedValue({
      data: { name: 'Banana', calories: 90, protein: 1, carbs: 23, fat: 0, confidence: 0.8 },
    });
    const res = await scannerService.analyzePhoto('data:image/jpeg;base64,AAA');
    expect(res.items).toHaveLength(1);
    expect(res.items[0].name).toBe('Banana');
    expect(res.items[0].id).toBeTruthy();
  });

  it('analyzePhotoGuest chama o endpoint sem conta', async () => {
    api.post.mockResolvedValue({ data: { items: [] } });
    await scannerService.analyzePhotoGuest('data:image/jpeg;base64,AAA');
    expect(api.post).toHaveBeenCalledWith(
      '/scanner/analyze-guest',
      { image: 'data:image/jpeg;base64,AAA' },
      expect.anything(),
    );
  });
});

describe('scanner cancelável', () => {
  it('abortar durante análise solicita cancelamento usando a chave idempotente', async () => {
    api.post.mockClear();
    let rejectScan!: (error: unknown) => void;
    api.post.mockImplementation((url: string) =>
      url === '/scanner/analyze'
        ? new Promise((_resolve, reject) => {
            rejectScan = reject;
          })
        : Promise.resolve({ data: { state: 'cancelled' } }),
    );
    const controller = new AbortController();
    const pending = scannerService.analyzePhoto('data:image/jpeg;base64,cancel', controller.signal);
    for (let i = 0; i < 10 && api.post.mock.calls.length === 0; i++) await Promise.resolve();
    controller.abort();
    const key = api.post.mock.calls[0][2].headers['Idempotency-Key'];
    expect(api.post.mock.calls[1][0]).toBe(`/credits/operations/by-key/${key}/cancel`);
    expect(api.post.mock.calls[1][1]).toEqual({});
    rejectScan(Object.assign(new Error('cancelled'), { code: 'ERR_CANCELED' }));
    await expect(pending).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  });
});
