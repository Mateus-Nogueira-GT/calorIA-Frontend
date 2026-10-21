import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockData = new Map<string, string>();
let mockUser = { user: { id: 'owner-A' }, sessionGeneration: 1 };
let mockSequence = 0;
jest.mock('@features/auth/store', () => ({ useAuthStore: { getState: () => mockUser } }));
jest.mock('./storage', () => ({
  kvStorage: {
    getItem: jest.fn(async (key: string) => mockData.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockData.set(key, value);
    }),
  },
}));
jest.mock('./credits.service', () => ({
  newOperationKey: () => `request-key-${String(++mockSequence).padStart(8, '0')}`,
}));
import {
  beginRequest,
  finishRequest,
  pendingRequests,
  isDefinitiveRejection,
  FAILED_BEFORE_SETTLEMENT,
} from './operation-requests';
import { kvStorage } from './storage';

beforeEach(() => {
  mockData.clear();
  mockUser = { user: { id: `owner-${++mockSequence}` }, sessionGeneration: 1 };
  jest.clearAllMocks();
});

describe('durable operation metadata', () => {
  it('reuses timeout retries with original date context; successful identical photos get a fresh key', async () => {
    const context = { date: '2026-10-15', tzOffsetMinutes: -180 };
    const a = await beginRequest('chat', 'conversation:hello', context);
    const b = await beginRequest('chat', 'conversation:hello', {
      date: '2026-10-16',
      tzOffsetMinutes: 0,
    });
    expect(b).toEqual(a);
    await finishRequest(a, mockUser.user.id);
    expect((await beginRequest('chat', 'conversation:hello', context)).key).not.toBe(a.key);
  });
  it('serializes concurrent metadata mutations and retains different unresolved payloads', async () => {
    await Promise.all([
      beginRequest('photo', 'private-photo-1'),
      beginRequest('chat', 'private-message'),
      beginRequest('photo', 'private-photo-2'),
    ]);
    const saved = await pendingRequests(mockUser.user.id);
    expect(saved).toHaveLength(3);
    const raw = [...mockData.values()].join('');
    expect(raw).not.toContain('private-photo');
    expect(raw).not.toContain('private-message');
  });
  it('two simultaneous identical requests share one key', async () => {
    const [a, b] = await Promise.all([
      beginRequest('photo', 'same'),
      beginRequest('photo', 'same'),
    ]);
    expect(a.key).toBe(b.key);
    expect(await pendingRequests(mockUser.user.id)).toHaveLength(1);
  });
  it('does not turn a delivered success into failure when cleanup storage rejects', async () => {
    const a = await beginRequest('photo', 'same');
    jest.mocked(kvStorage.setItem).mockImplementationOnce(() => {
      throw new Error('storage full');
    });
    await expect(finishRequest(a, mockUser.user.id)).resolves.toBeUndefined();
    expect((await beginRequest('photo', 'same')).key).not.toBe(a.key);
  });
  it('detects silently rejected persistence before allowing an upstream request', async () => {
    jest.mocked(kvStorage.setItem).mockImplementationOnce(async () => undefined);
    await expect(beginRequest('photo', 'same')).rejects.toThrow('guardar a tentativa');
  });
  it('cancels a session changed while pending metadata is loaded', async () => {
    jest.mocked(kvStorage.getItem).mockImplementationOnce(async () => {
      mockUser = { user: { id: 'different-account' }, sessionGeneration: 2 };
      return null;
    });
    await expect(beginRequest('photo', 'same')).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    expect(kvStorage.setItem).not.toHaveBeenCalled();
  });
  it('keeps ambiguous retries but clears terminal fenced failures', () => {
    expect(
      isDefinitiveRejection({ response: { status: 409, data: { error: 'OPERATION_PENDING' } } }),
    ).toBe(false);
    expect(
      isDefinitiveRejection({ response: { status: 409, data: { error: 'OPERATION_FAILED' } } }),
    ).toBe(true);
    expect(
      isDefinitiveRejection({ response: { status: 409, data: { error: 'OPERATION_CANCELLED' } } }),
    ).toBe(true);
    expect(isDefinitiveRejection({ response: { status: 503 } })).toBe(false);
  });

  it('erro do próprio servidor durante a operação encerra a tentativa (retry com chave nova)', () => {
    // O backend marca a operação como failed e libera a reserva ao lançar um
    // AppError dentro da execução; reusar a chave daria 409 OPERATION_FAILED.
    const definitive = (status: number, error: string) =>
      isDefinitiveRejection({ response: { status, data: { error, message: 'x' } } });
    expect(definitive(502, 'VISION_ERROR')).toBe(true);
    expect(definitive(502, 'AI_TRUNCATED')).toBe(true);
    expect(definitive(500, 'HISTORY_WRITE_FAILED')).toBe(true);
    expect(definitive(429, 'AI_QUOTA_EXCEEDED')).toBe(true);
  });

  it.each([
    [500, 'INTERNAL_SERVER_ERROR', false],
    [502, undefined, false],
    [503, 'CREDITS_UNAVAILABLE', false],
    [500, 'SOMETHING_NEW', false],
    [502, 'VISION_ERROR', true],
    [504, 'AI_TIMEOUT', true],
    [502, 'TRANSCRIBE_FAILED', true],
    [500, 'HISTORY_WRITE_FAILED', true],
    [409, 'OPERATION_FAILED', true],
    [429, 'TOO_MANY_REQUESTS', false],
    [422, 'NOT_FOOD', true],
  ] as Array<[number, string | undefined, boolean]>)(
    'status %s com código %s → definitivo = %s',
    (status, error, expected) => {
      expect(isDefinitiveRejection({ response: { status, data: error ? { error } : {} } })).toBe(
        expected,
      );
    },
  );

  it('a allowlist de 5xx definitivos é só de falhas anteriores à liquidação', () => {
    expect([...FAILED_BEFORE_SETTLEMENT].sort()).toEqual(
      [
        'AI_ERROR',
        'AI_TIMEOUT',
        'AI_TRUNCATED',
        'AI_UNAVAILABLE',
        'HISTORY_WRITE_FAILED',
        'TRANSCRIBE_FAILED',
        'VISION_ERROR',
      ].sort(),
    );
  });

  it('falha ambígua mantém a chave para recuperar o resultado sem cobrar de novo', () => {
    expect(
      isDefinitiveRejection({ response: { status: 503, data: { error: 'CREDITS_UNAVAILABLE' } } }),
    ).toBe(false);
    expect(
      isDefinitiveRejection({ response: { status: 429, data: { error: 'TOO_MANY_REQUESTS' } } }),
    ).toBe(false);
    // Gateway/timeout: corpo que não é do nosso servidor.
    expect(isDefinitiveRejection({ response: { status: 504, data: '<html>' } })).toBe(false);
    expect(isDefinitiveRejection({ code: 'ECONNABORTED' })).toBe(false);
  });
});
