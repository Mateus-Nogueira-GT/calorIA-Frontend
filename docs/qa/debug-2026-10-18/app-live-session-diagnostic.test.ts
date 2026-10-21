/** Actual Zustand auth/stores and actual Axios interceptors; only I/O is local. */
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../../../app/src/features/auth/store';
import { useCoachStore } from '../../../app/src/features/coach/store';
import { useScannerStore } from '../../../app/src/features/scanner/store';
import { useFoodLogStore } from '../../../app/src/features/food-log/store';
import { scannerService } from '../../../app/src/shared/services/scanner.service';
import api from '../../../app/src/shared/services/api';
import { kvStorage } from '../../../app/src/shared/services/storage';
import { pendingRequests } from '../../../app/src/shared/services/operation-requests';

const A = { id: 'live-owner-A', name: 'A', email: 'a@fixture.invalid' };
const B = { id: 'live-owner-B', name: 'B', email: 'b@fixture.invalid' };
const image = 'data:image/jpeg;base64,live-fixture';
const item = { id: 'scan-A', name: 'Refeição privada A', calories: 100, protein: 2, carbs: 20, fat: 1, confidence: .9 };
const response = (config: InternalAxiosRequestConfig, data: unknown) => ({ config, data, status: 200, statusText: 'OK', headers: {} });
const until = async (predicate: () => boolean) => {
  for (let i = 0; i < 200 && !predicate(); i++) await Promise.resolve();
  if (!predicate()) throw new Error('Diagnostic fixture did not reach seam');
};
const initialAdapter = api.defaults.adapter;
const baselineStorageGet = jest.mocked(kvStorage.getItem).getMockImplementation()!;
beforeEach(async () => {
  jest.mocked(kvStorage.getItem).mockImplementation(baselineStorageGet);
  await useAuthStore.persist.rehydrate();
  useAuthStore.getState().clearToken();
  useAuthStore.getState().setToken('fixture-A', A);
});
afterEach(() => { jest.restoreAllMocks(); api.defaults.adapter = initialAdapter; });

it('P1 actual stores: initial coach answer after logout loses its recovery key and conversation id', async () => {
  let deliver!: () => void;
  api.defaults.adapter = config => new Promise(resolve => { deliver = () => resolve(response(config, {
    conversation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    message: { role: 'assistant', content: 'Resposta salva A', created_at: '2026-10-18T00:00:00Z' },
    diet_generated: false, diet_id: null, diet_job_id: null,
  })); });
  const pending = useCoachStore.getState().sendMessage('primeira mensagem privada A');
  await until(() => Boolean(deliver));
  expect(await pendingRequests(A.id)).toHaveLength(1);
  useAuthStore.getState().clearToken();
  useAuthStore.getState().setToken('fixture-B', B);
  deliver();
  expect(await pending).toBe(false);
  expect(useCoachStore.getState().conversationId).toBeNull();
  expect(await pendingRequests(A.id)).toHaveLength(1);
});

it('P1 actual scanner/store/AbortSignal: logout during post-response cleanup loses the paid photo recovery', async () => {
  let releaseCleanup!: () => void;
  const originalGet = baselineStorageGet;
  let reads = 0;
  jest.spyOn(kvStorage, 'getItem').mockImplementation(key => {
    if (key === `caloria:pending-operations:${A.id}` && ++reads === 3) {
      return new Promise(resolve => { releaseCleanup = async () => resolve(await originalGet(key)); });
    }
    return originalGet(key);
  });
  api.defaults.adapter = async config => response(config, config.url?.endsWith('/cancel')
    ? { state: 'succeeded', operation_id: 'committed-operation' }
    : { items: [item] });
  const pending = useScannerStore.getState().analyze(image);
  await until(() => Boolean(releaseCleanup));
  useAuthStore.getState().clearToken(); // Calls scanner.clear(), which aborts its real controller.
  useAuthStore.getState().setToken('fixture-B', B);
  releaseCleanup();
  await pending;
  expect(useScannerStore.getState().items).toEqual([]);
  expect(await pendingRequests(A.id)).toHaveLength(1);
});

it('P1 actual auth interceptor: queued account switch can rebind old request payload to B credentials', async () => {
  const sent: InternalAxiosRequestConfig[] = [];
  api.defaults.adapter = async config => { sent.push(config); return response(config, { items: [item] }); };
  const actualPost = api.post.bind(api);
  jest.spyOn(api, 'post').mockImplementation((url, body, config) => {
    // Only schedule a real logout/login before the original async auth interceptor.
    // This models an already queued auth completion between guard and dispatch.
    if (url === '/scanner/analyze') Promise.resolve().then(() => {
      useAuthStore.getState().clearToken();
      useAuthStore.getState().setToken('fixture-B', B);
    });
    return actualPost(url, body, config);
  });
  await scannerService.analyzePhoto(image).catch(() => undefined);
  const photos = sent.filter(c => c.url === '/scanner/analyze');
  expect(photos[0]?.headers.Authorization).toBe('Bearer fixture-B'); // Actual new identity confirmed.
  expect(photos).toHaveLength(0);
});

it('P1 actual scanner confirm: old account meal response cannot populate new account diary or erase new scan', async () => {
  let deliver!: () => void;
  api.defaults.adapter = config => new Promise(resolve => { deliver = () => resolve(response(config, {
    ...item, id: 'meal-owned-by-A', loggedAt: '2026-10-18T00:00:00Z', mealType: 'other',
  })); });
  useScannerStore.setState({ items: [item] });
  const saving = useScannerStore.getState().confirm();
  await until(() => Boolean(deliver));
  useAuthStore.getState().clearToken();
  useAuthStore.getState().setToken('fixture-B', B);
  useScannerStore.setState({ image: 'photo-B', items: [{ ...item, id: 'scan-B', name: 'Refeição B' }] });
  deliver();
  await saving;
  expect(Object.values(useFoodLogStore.getState().mealsByDate).flat()).toEqual([]);
  expect(useScannerStore.getState().items[0]?.id).toBe('scan-B');
});


it('P1 actual coach text store: queued account switch cannot send private A message authenticated as B', async () => {
  const sent: InternalAxiosRequestConfig[] = [];
  api.defaults.adapter = async config => {
    sent.push(config);
    return response(config, {
      conversation_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      message: { role: 'assistant', content: 'Resposta fixture', created_at: '2026-10-18T00:00:00Z' },
      diet_generated: false, diet_id: null, diet_job_id: null,
    });
  };
  const actualPost = api.post.bind(api);
  jest.spyOn(api, 'post').mockImplementation((url, body, config) => {
    if (url === '/chat/message') Promise.resolve().then(() => {
      useAuthStore.getState().clearToken();
      useAuthStore.getState().setToken('fixture-B', B);
    });
    return actualPost(url, body, config);
  });
  const delivered = await useCoachStore.getState().sendMessage('mensagem privada originalmente digitada por A');
  expect(delivered).toBe(false);
  const posts = sent.filter(c => c.url === '/chat/message');
  expect(posts[0]?.headers.Authorization).toBe('Bearer fixture-B');
  expect(posts[0]?.data).toContain('mensagem privada originalmente digitada por A');
  // The actual UI store uses no AbortSignal for ordinary text messages.
  expect(posts).toHaveLength(0);
});
