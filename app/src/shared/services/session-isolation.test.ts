/** Actual Zustand auth/stores and actual Axios interceptors; only I/O is local. */
import type { InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@features/auth/store';
import { useCoachStore } from '@features/coach/store';
import { useScannerStore } from '@features/scanner/store';
import { coachService } from '@shared/services/coach.service';
import { finishRequest, pendingRequests } from '@shared/services/operation-requests';
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
afterEach(async () => {
  for (const user of [A, B]) {
    for (const request of await pendingRequests(user.id)) await finishRequest(request, user.id);
  }
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

const coachResponse = {
  conversation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  message: { role: 'assistant', content: 'Resposta salva A', created_at: '2026-10-18T00:00:00Z' },
  diet_generated: false,
  diet_id: null,
  diet_job_id: null,
};
const until = async (predicate: () => boolean) => {
  for (let i = 0; i < 200 && !predicate(); i++) await Promise.resolve();
  if (!predicate()) throw new Error('Controlled delivery was not reached');
};
const loginB = () => {
  useAuthStore.getState().clearToken();
  useAuthStore.getState().setToken('fixture-B', B);
};

it('primeiro turno do coach entregue depois do logout continua recuperável para A', async () => {
  let deliver!: () => void;
  api.defaults.adapter = (config) => new Promise((resolve) => {
    deliver = () => resolve(response(config, coachResponse));
  });
  const pending = useCoachStore.getState().sendMessage('primeira mensagem privada A');
  await until(() => Boolean(deliver));
  loginB();
  deliver();
  expect(await pending).toBe(false);
  expect(useCoachStore.getState().conversationId).toBeNull();
  expect(await pendingRequests(A.id)).toHaveLength(1);
});

it('foto entregue depois do logout continua recuperável para A', async () => {
  let deliver!: () => void;
  api.defaults.adapter = (config) => {
    if (config.url?.endsWith('/cancel')) return Promise.resolve(response(config, { state: 'succeeded' }));
    return new Promise((resolve) => {
      deliver = () => resolve(response(config, { items: [item] }));
    });
  };
  const pending = useScannerStore.getState().analyze(image);
  await until(() => Boolean(deliver));
  loginB();
  deliver();
  await pending;
  expect(useScannerStore.getState().items).toEqual([]);
  expect(await pendingRequests(A.id)).toHaveLength(1);
});

it('A volta e reenvia a mesma foto: mesma chave, sem nova chave', async () => {
  const keys: unknown[] = [];
  let deliver!: () => void;
  api.defaults.adapter = (config) => {
    if (config.url?.endsWith('/cancel')) return Promise.resolve(response(config, { state: 'succeeded' }));
    keys.push(config.headers.get('Idempotency-Key'));
    if (keys.length > 1) return Promise.resolve(response(config, { items: [item] }));
    return new Promise((resolve) => {
      deliver = () => resolve(response(config, { items: [item] }));
    });
  };
  // Delay only store delivery; transport, owner guards and storage stay real.
  const actualAnalyze = scannerService.analyzePhoto;
  let release!: () => void;
  const delivery = new Promise<void>((resolve) => { release = resolve; });
  let responseReady = false;
  jest.spyOn(scannerService, 'analyzePhoto').mockImplementationOnce(async (...args) => {
    const result = await actualAnalyze(...args);
    responseReady = true;
    await delivery;
    return result;
  });
  const pending = useScannerStore.getState().analyze(image);
  await until(() => Boolean(deliver));
  deliver();
  await until(() => responseReady);
  loginB();
  release();
  await pending;
  expect(useScannerStore.getState().items).toEqual([]);
  expect(await pendingRequests(A.id)).toHaveLength(1);
  useAuthStore.getState().clearToken();
  useAuthStore.getState().setToken('fixture-A', A);
  await useScannerStore.getState().analyze(image);
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
  expect(useScannerStore.getState().items).toEqual([item]);
  expect(await pendingRequests(A.id)).toHaveLength(0);
});

it('voz abortada depois da resposta mantém a pendência', async () => {
  let deliver!: () => void;
  api.defaults.adapter = (config) => new Promise((resolve) => {
    deliver = () => resolve(response(config, coachResponse));
  });
  let valid = true;
  const pending = useCoachStore.getState().sendMessage('voz privada A', {
    signal: new AbortController().signal,
    isValid: () => valid,
  });
  await until(() => Boolean(deliver));
  valid = false;
  deliver();
  expect(await pending).toBe(false);
  expect(useCoachStore.getState().conversationId).toBeNull();
  expect(await pendingRequests(A.id)).toHaveLength(1);
});

it.each([true, false])('retryLastAction atravessando troca de sessão (logout=%s) não aplica nem aposenta', async (logout) => {
  api.defaults.adapter = async (config) => response(config, coachResponse);
  const actualSend = coachService.sendMessage;
  let release!: () => void;
  const delivery = new Promise<void>((resolve) => { release = resolve; });
  let responseReady = false;
  jest.spyOn(coachService, 'sendMessage').mockImplementationOnce(async (...args) => {
    const result = await actualSend(...args);
    responseReady = true;
    await delivery;
    return result;
  });
  useCoachStore.setState({
    lastFailedAction: 'send',
    messages: [{ id: 'retry-A', role: 'user', content: 'mensagem pendente A', timestamp: new Date() }],
  });
  const pending = useCoachStore.getState().retryLastAction();
  await until(() => responseReady);
  // Direct setToken changes generation without resetting dietSession.
  if (logout) useAuthStore.getState().clearToken();
  useAuthStore.getState().setToken('fixture-B', B);
  release();
  await pending;
  expect(useCoachStore.getState().conversationId).toBeNull();
  expect(await pendingRequests(A.id)).toHaveLength(1);
});

it.each(['photo', 'chat'] as const)('resposta de %s que troca de dono antes do serviço não aposenta a chave', async (type) => {
  api.defaults.adapter = async (config) => response(config, type === 'photo' ? { items: [item] } : coachResponse);
  // Axios has completed its adapter cancellation check; account changes before service delivery.
  const interceptor = api.interceptors.response.use((result) => {
    loginB();
    return result;
  });
  try {
    const pending = type === 'photo'
      ? scannerService.analyzePhoto(image)
      : coachService.sendMessage('troca após transporte', null);
    await expect(pending).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    expect(await pendingRequests(A.id)).toHaveLength(1);
  } finally {
    api.interceptors.response.eject(interceptor);
  }
});

it.each([false, true])('coach entregue ao store (retry=%s) só aposenta depois de aplicar a conversa', async (retry) => {
  api.defaults.adapter = async (config) => response(config, coachResponse);
  const actualSend = coachService.sendMessage;
  let pendingAtDelivery = 0;
  let conversationAtAcknowledgement: string | null = null;
  jest.spyOn(coachService, 'sendMessage').mockImplementationOnce(async (...args) => {
    const result = await actualSend(...args);
    pendingAtDelivery = (await pendingRequests(A.id)).length;
    return {
      ...result,
      acknowledge: () => {
        conversationAtAcknowledgement = useCoachStore.getState().conversationId;
        return result.acknowledge();
      },
    };
  });
  if (retry) {
    useCoachStore.setState({
      lastFailedAction: 'send',
      messages: [{ id: 'retry-A', role: 'user', content: 'mensagem entregue A', timestamp: new Date() }],
    });
    await useCoachStore.getState().retryLastAction();
  } else {
    expect(await useCoachStore.getState().sendMessage('mensagem entregue A')).toBe(true);
  }
  expect(pendingAtDelivery).toBe(1);
  expect(conversationAtAcknowledgement).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  expect(useCoachStore.getState().conversationId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  expect(useCoachStore.getState().messages[1].content).toBe('Resposta salva A');
  expect(await pendingRequests(A.id)).toHaveLength(0);
});
