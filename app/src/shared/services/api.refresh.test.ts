import { useAuthStore } from '@features/auth/store';
import axios, { AxiosAdapter, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { waitFor } from '@testing-library/react-native';
import { coachService } from './coach.service';
import api, { applyRefreshedSession } from './api';

const USER = { id: 'u1', name: 'Rafael', email: 'rafael@exemplo.com' };

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
