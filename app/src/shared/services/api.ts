import axios from 'axios';
import { Platform } from 'react-native';
import { API_BASE_URL, API_TIMEOUT } from '@env';
import { useAuthStore } from '@features/auth/store';

/**
 * URL da API: o .env manda; sem ele, fallback de DEV por plataforma.
 * No emulador Android, `localhost` é o PRÓPRIO emulador — o host da máquina
 * é 10.0.2.2. Em release, a ausência de API_BASE_URL lança na inicialização
 * (fail-fast) — o fallback de dev só existe sob __DEV__.
 * (o ATS do iOS bloqueia http e o app ficaria inoperante).
 */
export function resolveBaseUrl(
  envUrl: string | undefined,
  platform: string = Platform.OS,
): string {
  if (envUrl) return envUrl;
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    return platform === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
  }
  throw new Error(
    'API_BASE_URL ausente no build de release — configure app/.env antes de gerar o bundle.',
  );
}

const BASE_URL = resolveBaseUrl(API_BASE_URL);

const api = axios.create({
  baseURL: BASE_URL,
  timeout: Number(API_TIMEOUT) || 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  // pendingAuth é a sessão do onboarding, antes de `token` existir: sem esse
  // fallback, salvar o perfil exigiria autenticar ANTES de saber se o perfil
  // salvou — e o dashboard montava com o request ainda em voo.
  // O refresh (abaixo) já usava o mesmo fallback.
  const { token, pendingAuth } = useAuthStore.getState();
  const accessToken = token ?? pendingAuth?.token ?? null;
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

/**
 * Resultado do refresh distingue FALHA DE AUTENTICAÇÃO (refresh token
 * rejeitado → desloga) de FALHA DE REDE (offline/timeout → NÃO desloga;
 * o request original falha e o usuário tenta de novo quando voltar a conexão).
 */
type RefreshResult = { token: string } | { token: null; reason: 'auth' | 'network' };

let refreshPromise: Promise<RefreshResult> | null = null;

type SessionUser = NonNullable<ReturnType<typeof useAuthStore.getState>['user']>;

/**
 * Grava a sessão renovada no MESMO lugar de onde ela veio.
 *
 * No onboarding a sessão vive em `pendingAuth` (ainda não há `token`). Chamar
 * `setToken` ali autenticava o usuário e — como `pendingAuth` existia — marcava
 * `profileComplete: true` sem o perfil ter sido salvo: bastava o access token
 * expirar (1 h) com o app parado no ProfileSetup para o próximo request jogar a
 * pessoa no Dashboard sem altura, peso nem objetivo (a mesma falha do R6).
 */
export function applyRefreshedSession(
  accessToken: string,
  refreshToken: string,
  user: SessionUser,
): void {
  const state = useAuthStore.getState();
  if (!state.token && state.pendingAuth) {
    state.setPendingAuth(accessToken, user, refreshToken);
    return;
  }
  state.setToken(accessToken, user, refreshToken);
}

async function refreshAccessToken(): Promise<RefreshResult> {
  const { refreshToken, user, pendingAuth } = useAuthStore.getState();
  const currentRefreshToken = refreshToken ?? pendingAuth?.refreshToken ?? null;
  const currentUser = user ?? pendingAuth?.user ?? null;
  if (!currentRefreshToken || !currentUser) return { token: null, reason: 'auth' };

  try {
    const { data } = await axios.post(
      `${BASE_URL}/auth/refresh`,
      { refresh_token: currentRefreshToken },
      { timeout: Number(API_TIMEOUT) || 10000 },
    );
    applyRefreshedSession(data.access_token, data.refresh_token, currentUser);
    return { token: data.access_token as string };
  } catch (err) {
    const isAuthRejection =
      axios.isAxiosError(err) &&
      err.response != null &&
      err.response.status >= 400 &&
      err.response.status < 500;
    return { token: null, reason: isAuthRejection ? 'auth' : 'network' };
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    if (error.response?.status === 401 && config && !config._retry) {
      config._retry = true;
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }
      const result = await refreshPromise;
      if (result.token != null) {
        config.headers.Authorization = `Bearer ${result.token}`;
        return api(config);
      }
      // Só desloga se o refresh foi REJEITADO; queda de rede mantém a sessão.
      if (result.reason === 'auth') {
        useAuthStore.getState().clearToken();
      }
      return Promise.reject(error);
    }
    if (error.response?.status === 401 && config?._retry) {
      // Retry com token novo ainda 401 → sessão realmente inválida.
      useAuthStore.getState().clearToken();
    }
    return Promise.reject(error);
  },
);

export default api;
