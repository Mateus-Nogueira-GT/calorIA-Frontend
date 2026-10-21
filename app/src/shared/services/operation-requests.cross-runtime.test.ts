/* eslint-disable @typescript-eslint/no-require-imports -- cada "aba" precisa de um módulo isolado */
/**
 * Regressões do debug de 18/10 (D04 e 500 ambíguo), vindas de
 * docs/qa/debug-2026-10-18/app-operation-diagnostic.test.ts.
 */
import type { InternalAxiosRequestConfig } from 'axios';

const mockData = new Map<string, string>();
let mockAuth = {
  user: { id: 'owner-A' },
  sessionGeneration: 1,
  token: 'fixture-token-A',
  pendingAuth: null,
};
let mockRead: ((key: string) => Promise<string | null>) | undefined;
jest.mock('@features/auth/store', () => ({
  useAuthStore: { getState: () => mockAuth, subscribe: () => () => undefined },
}));
jest.mock('./storage', () => ({
  kvStorage: {
    getItem: jest.fn(async (key: string) =>
      mockRead ? mockRead(key) : (mockData.get(key) ?? null),
    ),
    setItem: jest.fn(async (key: string, value: string) => {
      mockData.set(key, value);
    }),
  },
}));

type OperationRequests = typeof import('./operation-requests');

const photo = 'data:image/jpeg;base64,regression-fixture';
const result = {
  items: [
    { id: 'food-1', name: 'Arroz', calories: 100, protein: 2, carbs: 20, fat: 1, confidence: 0.9 },
  ],
};
const response = (config: InternalAxiosRequestConfig, data: unknown = result) => ({
  config,
  data,
  status: 200,
  statusText: 'OK',
  headers: {},
});
const waitUntil = async (predicate: () => boolean) => {
  for (let i = 0; i < 100 && !predicate(); i++) await Promise.resolve();
  if (!predicate()) throw new Error('fixture did not reach the expected seam');
};

/** Web Locks de teste: um mutex FIFO por nome, compartilhado entre "abas". */
function installSharedLocks() {
  const queues = new Map<string, Promise<unknown>>();
  const locks = {
    request: (name: string, action: () => Promise<unknown>) => {
      const previous = queues.get(name) ?? Promise.resolve();
      const next = previous.catch(() => undefined).then(action);
      queues.set(name, next);
      return next;
    },
  };
  Object.defineProperty(globalThis.navigator, 'locks', { value: locks, configurable: true });
}

function twoRuntimes(): [OperationRequests, OperationRequests] {
  let a!: OperationRequests;
  let b!: OperationRequests;
  jest.isolateModules(() => {
    a = require('./operation-requests');
  });
  jest.isolateModules(() => {
    b = require('./operation-requests');
  });
  return [a, b];
}

beforeEach(() => {
  jest.resetModules();
  mockData.clear();
  mockRead = undefined;
  mockAuth = {
    user: { id: 'owner-A' },
    sessionGeneration: 1,
    token: 'fixture-token-A',
    pendingAuth: null,
  };
  delete (globalThis.navigator as { locks?: unknown }).locks;
});

describe('pendências entre runtimes (D04)', () => {
  it('duas abas com Web Locks não apagam a pendência uma da outra', async () => {
    installSharedLocks();
    const [clientA, clientB] = twoRuntimes();
    let releaseOldRead!: () => void;
    let first = true;
    mockRead = async (key) => {
      if (first) {
        first = false;
        return new Promise((resolve) => {
          releaseOldRead = () => resolve(mockData.get(key) ?? null);
        });
      }
      return mockData.get(key) ?? null;
    };
    const pendingB = clientB.beginRequest('chat', 'private-chat-fixture');
    await waitUntil(() => Boolean(releaseOldRead));
    const pendingA = clientA.beginRequest('photo', photo);
    releaseOldRead();
    await Promise.all([pendingA, pendingB]);
    expect(await clientA.pendingRequests('owner-A')).toHaveLength(2);
  });

  it('sem Web Locks, uma aba continua serializando foto e conversa', async () => {
    const { beginRequest, pendingRequests } = require('./operation-requests') as OperationRequests;
    await Promise.all([beginRequest('photo', photo), beginRequest('chat', 'chat-fixture')]);
    expect(await pendingRequests('owner-A')).toHaveLength(2);
  });
});

describe('500 ambíguo preserva a chave', () => {
  function scannerWith(adapter: (config: InternalAxiosRequestConfig) => Promise<unknown>) {
    const { scannerService } = require('./scanner.service');
    const api = require('./api').default;
    api.defaults.adapter = adapter;
    return scannerService as {
      analyzePhoto: (image: string) => Promise<{ acknowledge: () => Promise<void> }>;
    };
  }
  const serverError = (config: InternalAxiosRequestConfig, status: number, data: unknown) => {
    const { AxiosError } = require('axios');
    return new AxiosError('server error', 'ERR_BAD_RESPONSE', config, null, {
      ...response(config),
      status,
      data,
    });
  };

  it('500 INTERNAL_SERVER_ERROR depois do commit: o retry usa a mesma chave', async () => {
    const keys = new Set<string>();
    let calls = 0;
    const scanner = scannerWith(async (config) => {
      keys.add(String(config.headers['Idempotency-Key']));
      if (++calls === 1) throw serverError(config, 500, { error: 'INTERNAL_SERVER_ERROR' });
      return response(config);
    });
    await scanner.analyzePhoto(photo).catch(() => undefined);
    await scanner.analyzePhoto(photo);
    expect(calls).toBe(2);
    expect(keys.size).toBe(1);
  });

  it('500, 500 e depois 409 OPERATION_FAILED: mesma chave até o 409, chave nova depois', async () => {
    const keys: string[] = [];
    const scanner = scannerWith(async (config) => {
      keys.push(String(config.headers['Idempotency-Key']));
      if (keys.length <= 2) throw serverError(config, 500, { error: 'INTERNAL_SERVER_ERROR' });
      if (keys.length === 3) throw serverError(config, 409, { error: 'OPERATION_FAILED' });
      return response(config);
    });
    for (let i = 0; i < 3; i++) await scanner.analyzePhoto(photo).catch(() => undefined);
    await scanner.analyzePhoto(photo);
    expect(new Set(keys.slice(0, 3)).size).toBe(1);
    expect(keys[3]).not.toBe(keys[0]);
  });
});
