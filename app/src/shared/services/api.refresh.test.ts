import { useAuthStore } from '@features/auth/store';
import axios, { AxiosAdapter, AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { waitFor } from '@testing-library/react-native';
import { coachService } from './coach.service';
import api, { applyRefreshedSession } from './api';

const USER = { id: 'u1', name: 'Rafael', email: 'rafael@exemplo.com' };

describe('request session ownership', () => {
  const originalAdapter = api.defaults.adapter;
  let dispatched: InternalAxiosRequestConfig[];

  beforeEach(() => {
    useAuthStore.getState().clearToken();
    useAuthStore.getState().setToken('old', USER, 'old-refresh');
    dispatched = [];
    api.defaults.adapter = async (config) => {
      dispatched.push(config);
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    };
  });

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
  });

  it('cancela um request de A antes de despachar com a credencial de B', async () => {
    const state = useAuthStore.getState();
    const config = {
      caloriaOwner: { userId: 'u1', generation: state.sessionGeneration },
    };
    const request = api.post('/chat', {}, config).catch((error: unknown) => error);
    useAuthStore.getState().setToken('new', { id: 'u2', name: 'Outra', email: 'other@test.com' });

    expect(await request).toMatchObject({ code: 'ERR_CANCELED' });
    expect(dispatched).toHaveLength(0);
  });

  it('cancela retry de geração antiga antes de anexar Authorization', async () => {
    const config: AxiosRequestConfig & { _caloriaSessionGeneration: number } = {
      _caloriaSessionGeneration: useAuthStore.getState().sessionGeneration,
    };
    useAuthStore.getState().clearToken();
    useAuthStore.getState().setToken('new', { id: 'u2', name: 'Outra', email: 'other@test.com' });
    let intercepted: InternalAxiosRequestConfig | undefined;
    const interceptor = api.interceptors.request.use((requestConfig) => {
      intercepted = requestConfig;
      return requestConfig;
    });
    try {
      const result = await api.post('/chat', {}, config).catch((error: unknown) => error);

      expect(result).toMatchObject({ code: 'ERR_CANCELED' });
      expect(intercepted?.headers.Authorization).toBeUndefined();
      expect(dispatched).toHaveLength(0);
    } finally {
      api.interceptors.request.eject(interceptor);
    }
  });

  it('continua anexando o token atual para requests sem dono explícito', async () => {
    useAuthStore.getState().setToken('current', USER);

    await api.post('/chat', {});

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].headers.Authorization).toBe('Bearer current');
  });
});

describe('applyRefreshedSession', () => {
  beforeEach(() => {
    useAuthStore.getState().clearToken();
  });

  it('no onboarding (só pendingAuth) renova a sessão pendente sem autenticar nem marcar o perfil como completo', () => {
    useAuthStore.getState().setPendingAuth('old-access', USER, 'old-refresh');

    applyRefreshedSession('new-access', 'new-refresh', USER);

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.token).toBeNull();
    expect(state.profileComplete).toBeNull();
    expect(state.pendingAuth).toEqual({
      token: 'new-access',
      refreshToken: 'new-refresh',
      user: USER,
    });
  });

  it('com sessão normal troca o token e mantém profileComplete', () => {
    useAuthStore.getState().setToken('old-access', USER, 'old-refresh');
    useAuthStore.getState().setProfileComplete(false);

    applyRefreshedSession('new-access', 'new-refresh', USER);

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.token).toBe('new-access');
    expect(state.refreshToken).toBe('new-refresh');
    expect(state.profileComplete).toBe(false);
  });
});

it('logout durante refresh não restaura sessão antiga nem apaga o novo login', async () => {
  const oldApiAdapter = api.defaults.adapter;
  const oldAxiosAdapter = axios.defaults.adapter;
  let resolveRefresh: (value: {
    data: { access_token: string; refresh_token: string };
    status: number;
    statusText: string;
    headers: Record<string, string>;
    config: InternalAxiosRequestConfig;
  }) => void = () => {};
  let refreshConfig: InternalAxiosRequestConfig | undefined;
  const adapter: AxiosAdapter = async (config) => {
    if (config.url?.endsWith('/auth/refresh')) {
      refreshConfig = config;
      return new Promise((resolve) => {
        resolveRefresh = resolve;
      });
    }
    throw new AxiosError('expired', 'ERR_BAD_REQUEST', config, null, {
      data: {},
      status: 401,
      statusText: 'Unauthorized',
      headers: {},
      config,
    });
  };
  api.defaults.adapter = adapter;
  axios.defaults.adapter = adapter;
  try {
    useAuthStore.getState().setToken('old', USER, 'old-refresh');
    const request = api.post('/chat/transcribe', {}).catch((error: unknown) => error);
    await waitFor(() => expect(refreshConfig).toBeDefined());
    useAuthStore.getState().clearToken();
    useAuthStore
      .getState()
      .setToken('new-account', { id: 'u2', name: 'Outra', email: 'other@test.com' }, 'new-refresh');
    if (!refreshConfig) throw new Error('refresh não começou');
    resolveRefresh({
      data: { access_token: 'old-renewed', refresh_token: 'old-refresh-renewed' },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: refreshConfig,
    });
    await request;
    expect(useAuthStore.getState().token).toBe('new-account');
    expect(useAuthStore.getState().user?.id).toBe('u2');
  } finally {
    api.defaults.adapter = oldApiAdapter;
    axios.defaults.adapter = oldAxiosAdapter;
  }
});

it('cancelamento antes do interceptor impede enviar voz com o token da conta seguinte', async () => {
  const original = api.defaults.adapter;
  const adapter = jest.fn<ReturnType<AxiosAdapter>, Parameters<AxiosAdapter>>();
  api.defaults.adapter = adapter;
  const controller = new AbortController();
  try {
    useAuthStore.getState().setToken('old', USER, 'old-refresh');
    const request = coachService
      .sendMessage('voz antiga', null, {
        signal: controller.signal,
        isValid: () => !controller.signal.aborted,
      })
      .catch((error: unknown) => error);
    useAuthStore.getState().clearToken();
    controller.abort();
    useAuthStore.getState().setToken('new', { id: 'u2', name: 'Outra', email: 'other@test.com' });
    expect(await request).toMatchObject({ code: 'ERR_CANCELED' });
    expect(adapter).not.toHaveBeenCalled();
  } finally {
    api.defaults.adapter = original;
  }
});

/** Adapter que responde por URL: status numérico vira erro do axios. */
function routeAdapter(routes: Record<string, number>, seen: string[]): AxiosAdapter {
  return async (config) => {
    const url = config.url ?? '';
    seen.push(url);
    const key = Object.keys(routes).find((path) => url.endsWith(path));
    const status = key ? routes[key] : 200;
    const response = {
      data: status === 200 ? { access_token: 'renewed', refresh_token: 'r2' } : {},
      status,
      statusText: String(status),
      headers: {},
      config,
    };
    if (status >= 400) {
      throw new AxiosError(String(status), 'ERR_BAD_REQUEST', config, null, response);
    }
    return response;
  };
}

describe('refresh limitado (429)', () => {
  const oldApiAdapter = api.defaults.adapter;
  const oldAxiosAdapter = axios.defaults.adapter;
  afterEach(() => {
    api.defaults.adapter = oldApiAdapter;
    axios.defaults.adapter = oldAxiosAdapter;
  });

  it('A2: 429 em /auth/refresh não desloga — o refresh token não foi recusado', async () => {
    const seen: string[] = [];
    const adapter = routeAdapter({ '/auth/refresh': 429, '/users/me': 401 }, seen);
    api.defaults.adapter = adapter;
    axios.defaults.adapter = adapter;
    useAuthStore.getState().clearToken();
    useAuthStore.getState().setToken('old', USER, 'old-refresh');

    const result = await api.get('/users/me').catch((error: unknown) => error);

    expect(result).toMatchObject({ response: { status: 401 } });
    expect(seen.some((url) => url.endsWith('/auth/refresh'))).toBe(true);
    expect(useAuthStore.getState().token).toBe('old');
    expect(useAuthStore.getState().refreshToken).toBe('old-refresh');
  });
});

describe('401 de rota /auth/*', () => {
  const oldApiAdapter = api.defaults.adapter;
  const oldAxiosAdapter = axios.defaults.adapter;
  afterEach(() => {
    api.defaults.adapter = oldApiAdapter;
    axios.defaults.adapter = oldAxiosAdapter;
  });

  it('A8: 401 INVALID_RESET_TOKEN em /auth/reset-password mantém a sessão e não tenta refresh', async () => {
    const seen: string[] = [];
    const adapter = routeAdapter({ '/auth/reset-password': 401 }, seen);
    api.defaults.adapter = adapter;
    axios.defaults.adapter = adapter;
    useAuthStore.getState().clearToken();
    useAuthStore.getState().setToken('old', USER, 'old-refresh');

    const result = await api
      .post('/auth/reset-password', { access_token: 'x', new_password: '12345678' })
      .catch((error: unknown) => error);

    expect(result).toMatchObject({ response: { status: 401 } });
    expect(seen.some((url) => url.endsWith('/auth/refresh'))).toBe(false);
    expect(useAuthStore.getState().token).toBe('old');
  });

  it('401 de rota comum continua tentando refresh', async () => {
    const seen: string[] = [];
    const adapter = routeAdapter({ '/users/me': 401, '/auth/refresh': 401 }, seen);
    api.defaults.adapter = adapter;
    axios.defaults.adapter = adapter;
    useAuthStore.getState().clearToken();
    useAuthStore.getState().setToken('old', USER, 'old-refresh');

    await api.get('/users/me').catch(() => undefined);

    expect(seen.some((url) => url.endsWith('/auth/refresh'))).toBe(true);
    expect(useAuthStore.getState().token).toBeNull();
  });
});
