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
  acknowledgeRequest,
  beginRequest,
  finishRequest,
  pendingRequests,
  isDefinitiveRejection,
  FAILED_BEFORE_SETTLEMENT,
  REUSE_WINDOW_MS,
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
  it('R1: entrega reconhecida aposenta para reuso as pendências anteriores da conversa, mas não as lista fora', async () => {
    const context = { date: '2026-11-25', tzOffsetMinutes: -180, scope: 'conv-1' };
    const failed = await beginRequest('chat', 'conv-1:sim', context);
    const other = await beginRequest('chat', 'conv-2:sim', { ...context, scope: 'conv-2' });
    const delivered = await beginRequest('chat', 'conv-1:quero almoçar', context);
    await acknowledgeRequest(delivered, mockUser.user.id);
    const saved = await pendingRequests(mockUser.user.id);
    expect(saved.map((r) => r.key)).toEqual([failed.key, other.key]);
    expect(saved.find((r) => r.key === failed.key)?.superseded).toBe(true);
    expect(saved.find((r) => r.key === other.key)?.superseded).toBeUndefined();
    expect((await beginRequest('chat', 'conv-1:sim', context)).key).not.toBe(failed.key);
    expect((await beginRequest('chat', 'conv-2:sim', context)).key).toBe(other.key);
  });
  const storedSignature = async (payload: string) => {
    const probe = await beginRequest('chat', payload);
    await finishRequest(probe, mockUser.user.id);
    return probe.signature;
  };
  const store = (items: unknown[]) =>
    mockData.set(`caloria:pending-operations:${mockUser.user.id}`, JSON.stringify(items));
  it('R1: a marca de aposentada vem do armazenamento (outro runtime) e vale também para o retry', async () => {
    const signature = await storedSignature('conv-1:sim');
    store([
      {
        key: 'request-key-stale-0001',
        type: 'chat',
        signature,
        created_at: new Date().toISOString(),
        superseded: true,
      },
    ]);
    expect(await pendingRequests(mockUser.user.id)).toHaveLength(1);
    const next = await beginRequest('chat', 'conv-1:sim', undefined, { retry: true });
    expect(next.key).not.toBe('request-key-stale-0001');
  });
  it('R1: pendência fora da janela só serve ao retry explícito', async () => {
    const signature = await storedSignature('conv-1:sim');
    const old = new Date(Date.now() - REUSE_WINDOW_MS - 1000).toISOString();
    store([{ key: 'request-key-old-00001', type: 'chat', signature, created_at: old }]);
    expect((await beginRequest('chat', 'conv-1:sim', undefined, { retry: true })).key).toBe(
      'request-key-old-00001',
    );
    store([{ key: 'request-key-old-00002', type: 'chat', signature, created_at: old }]);
    expect((await beginRequest('chat', 'conv-1:sim')).key).not.toBe('request-key-old-00002');
    expect((await pendingRequests(mockUser.user.id)).map((r) => r.key)).toContain(
      'request-key-old-00002',
    );
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
    [409, 'IDEMPOTENCY_CONFLICT', true],
    [409, 'CONVERSATION_BUSY', false],
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
