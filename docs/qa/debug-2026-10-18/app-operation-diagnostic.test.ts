/** Diagnostic tests assert the desired safety property and intentionally fail on f5ca5bf. */
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';

const mockData = new Map<string, string>();
let mockAuth = {
  user: { id: 'owner-A' }, sessionGeneration: 1, token: 'fixture-token-A', pendingAuth: null,
};
let mockRead: ((key: string) => Promise<string | null>) | undefined;
jest.mock('@features/auth/store', () => ({ useAuthStore: { getState: () => mockAuth } }));
jest.mock('../../../app/src/shared/services/storage', () => ({ kvStorage: {
  getItem: jest.fn(async (key: string) => mockRead ? mockRead(key) : mockData.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => { mockData.set(key, value); }),
} }));

const photo = 'data:image/jpeg;base64,diagnostic-fixture';
const result = { items: [{ id: 'food-1', name: 'Arroz', calories: 100, protein: 2, carbs: 20, fat: 1, fiber: 1, confidence: .9 }] };
const response = (config: InternalAxiosRequestConfig, data: unknown = result) => ({ config, data, status: 200, statusText: 'OK', headers: {} });
const waitUntil = async (predicate: () => boolean) => {
  for (let i = 0; i < 100 && !predicate(); i++) await Promise.resolve();
  if (!predicate()) throw new Error('Diagnostic fixture did not reach the expected seam');
};
beforeEach(() => {
  jest.resetModules(); mockData.clear(); mockRead = undefined;
  mockAuth = { user: { id: 'owner-A' }, sessionGeneration: 1, token: 'fixture-token-A', pendingAuth: null };
});

it('P1: completed photo arriving after account change remains discoverable for its owner', async () => {
  const { scannerService } = require('../../../app/src/shared/services/scanner.service');
  const api = require('../../../app/src/shared/services/api').default;
  const { pendingRequests } = require('../../../app/src/shared/services/operation-requests');
  let deliver!: () => void;
  api.defaults.adapter = (config: InternalAxiosRequestConfig) => new Promise(resolve => { deliver = () => resolve(response(config)); });
  const pending = scannerService.analyzePhoto(photo).catch((e: unknown) => e);
  await waitUntil(() => Boolean(deliver));
  expect(await pendingRequests('owner-A')).toHaveLength(1);
  mockAuth = { user: { id: 'owner-B' }, sessionGeneration: 2, token: 'fixture-token-B', pendingAuth: null };
  deliver();
  expect(await pending).toMatchObject({ code: 'ERR_CANCELED' });
  // Actual f5ca5bf: 0. The charged result has no local recovery key on return to A.
  expect(await pendingRequests('owner-A')).toHaveLength(1);
});

it('P1: account switch between service guard and Axios interceptor cannot send the old photo as another user', async () => {
  const { scannerService } = require('../../../app/src/shared/services/scanner.service');
  const api = require('../../../app/src/shared/services/api').default;
  const sent: InternalAxiosRequestConfig[] = [];
  api.defaults.adapter = async (config: InternalAxiosRequestConfig) => { sent.push(config); return response(config); };
  // Axios request interceptors run asynchronously and in reverse registration order.
  // This extra interceptor inserts only the scheduling seam: account switch just
  // after scanner's own guard but before its auth interceptor reads live state.
  const id = api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    mockAuth = { user: { id: 'owner-B' }, sessionGeneration: 2, token: 'fixture-token-B', pendingAuth: null };
    return config;
  });
  await scannerService.analyzePhoto(photo).catch(() => undefined);
  api.interceptors.request.eject(id);
  // Actual: one POST, with B's token and A's photo. No real network/provider.
  expect(sent).toHaveLength(0);
});

it('RISCO condicional: HTTP500 apos-commit simulado deve preservar a chave (sem debito real provado)', async () => {
  const { scannerService } = require('../../../app/src/shared/services/scanner.service');
  const api = require('../../../app/src/shared/services/api').default;
  const { AxiosError } = require('axios');
  const keys = new Set<string>();
  let calls = 0;
  api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    keys.add(String(config.headers['Idempotency-Key']));
    if (++calls === 1) {
      // Server debit/result commit succeeded, then its response serializer failed.
      throw new AxiosError('serialize failed', 'ERR_BAD_RESPONSE', config, null,
        { ...response(config), status: 500, data: { error: 'INTERNAL_SERVER_ERROR' } });
    }
    return response(config);
  };
  await scannerService.analyzePhoto(photo).catch(() => undefined);
  await scannerService.analyzePhoto(photo);
  expect(calls).toBe(2);
  // Actual: 2 keys, so the backend cannot replay the previously committed result.
  expect(keys.size).toBe(1);
});

it('P2: two browser runtimes cannot erase one another\'s pending operation metadata', async () => {
  let clientA: typeof import('../../../app/src/shared/services/operation-requests');
  let clientB: typeof import('../../../app/src/shared/services/operation-requests');
  jest.isolateModules(() => { clientA = require('../../../app/src/shared/services/operation-requests'); });
  jest.isolateModules(() => { clientB = require('../../../app/src/shared/services/operation-requests'); });
  let releaseOldRead!: () => void;
  let first = true;
  mockRead = async (key) => {
    if (first) { first = false; return new Promise(resolve => { releaseOldRead = () => resolve(null); }); }
    return mockData.get(key) ?? null;
  };
  const pendingB = clientB!.beginRequest('chat', 'private-chat-fixture');
  await waitUntil(() => Boolean(releaseOldRead));
  await clientA!.beginRequest('photo', photo);
  releaseOldRead();
  await pendingB;
  // Actual: only B's metadata remains. Per-module queue is not shared across tabs.
  expect(await clientA!.pendingRequests('owner-A')).toHaveLength(2);
});
