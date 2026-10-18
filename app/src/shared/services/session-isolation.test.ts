/** Actual Zustand auth/stores and actual Axios interceptors; only I/O is local. */
import type { InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@features/auth/store';
import { useCoachStore } from '@features/coach/store';
import { scannerService } from '@shared/services/scanner.service';
import api from '@shared/services/api';
import { foodLogService } from '@shared/services/food-log.service';
import { captureSessionOwner } from '@shared/services/session-owner';
import { kvStorage } from '@shared/services/storage';

const A = { id: 'live-owner-A', name: 'A', email: 'a@fixture.invalid' };
const B = { id: 'live-owner-B', name: 'B', email: 'b@fixture.invalid' };
const image = 'data:image/jpeg;base64,live-fixture';
const item = {
  id: 'scan-A',
  name: 'Refeição privada A',
  calories: 100,
  protein: 2,
  carbs: 20,
  fat: 1,
  confidence: 0.9,
};
const response = (config: InternalAxiosRequestConfig, data: unknown) => ({
  config,
  data,
  status: 200,
  statusText: 'OK',
  headers: {},
});
const initialAdapter = api.defaults.adapter;
const baselineStorageGet = jest.mocked(kvStorage.getItem).getMockImplementation()!;
beforeEach(async () => {
  jest.mocked(kvStorage.getItem).mockImplementation(baselineStorageGet);
  await useAuthStore.persist.rehydrate();
  useAuthStore.getState().clearToken();
  useAuthStore.getState().setToken('fixture-A', A);
});
afterEach(() => {
  jest.restoreAllMocks();
  api.defaults.adapter = initialAdapter;
});

it('troca de conta enfileirada não envia a foto de A com credencial de B', async () => {
  const sent: InternalAxiosRequestConfig[] = [];
  api.defaults.adapter = async (config) => {
    sent.push(config);
    return response(config, { items: [item] });
  };
  const actualPost = api.post.bind(api);
  jest.spyOn(api, 'post').mockImplementation((url, body, config) => {
    // Only schedule a real logout/login before the original async auth interceptor.
    // This models an already queued auth completion between guard and dispatch.
    if (url === '/scanner/analyze')
      Promise.resolve().then(() => {
        useAuthStore.getState().clearToken();
        useAuthStore.getState().setToken('fixture-B', B);
      });
    return actualPost(url, body, config);
  });
  await scannerService.analyzePhoto(image).catch(() => undefined);
  const photos = sent.filter((c) => c.url === '/scanner/analyze');
  expect(photos).toHaveLength(0);
});

it('troca de conta enfileirada não envia a mensagem de A com credencial de B', async () => {
  const sent: InternalAxiosRequestConfig[] = [];
  api.defaults.adapter = async (config) => {
    sent.push(config);
    return response(config, {
      conversation_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      message: {
        role: 'assistant',
        content: 'Resposta fixture',
        created_at: '2026-10-18T00:00:00Z',
      },
      diet_generated: false,
      diet_id: null,
      diet_job_id: null,
    });
  };
  const actualPost = api.post.bind(api);
  jest.spyOn(api, 'post').mockImplementation((url, body, config) => {
    if (url === '/chat/message')
      Promise.resolve().then(() => {
        useAuthStore.getState().clearToken();
        useAuthStore.getState().setToken('fixture-B', B);
      });
    return actualPost(url, body, config);
  });
  const delivered = await useCoachStore
    .getState()
    .sendMessage('mensagem privada originalmente digitada por A');
  expect(delivered).toBe(false);
  const posts = sent.filter((c) => c.url === '/chat/message');
  // The actual UI store uses no AbortSignal for ordinary text messages.
  expect(posts).toHaveLength(0);
});

it('troca de conta enfileirada não envia a refeição vinculada de A com credencial de B', async () => {
  const sent: InternalAxiosRequestConfig[] = [];
  api.defaults.adapter = async (config) => {
    sent.push(config);
    return response(config, { ...item, loggedAt: '2026-10-18T00:00:00Z', mealType: 'other' });
  };
  const owner = captureSessionOwner();
  const saving = foodLogService.addMeal(item, owner);
  useAuthStore.getState().clearToken();
  useAuthStore.getState().setToken('fixture-B', B);

  await expect(saving).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  expect(sent.filter((config) => config.url === '/food-log')).toHaveLength(0);
});
