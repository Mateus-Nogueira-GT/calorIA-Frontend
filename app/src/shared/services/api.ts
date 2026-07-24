import axios from 'axios';
import { API_BASE_URL, API_TIMEOUT } from '@env';
import { useAuthStore } from '@features/auth/store';

const api = axios.create({
  baseURL: API_BASE_URL || 'http://localhost:3000',
  timeout: Number(API_TIMEOUT) || 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
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

async function refreshAccessToken(): Promise<RefreshResult> {
  const { refreshToken, user, pendingAuth } = useAuthStore.getState();
  const currentRefreshToken = refreshToken ?? pendingAuth?.refreshToken ?? null;
  const currentUser = user ?? pendingAuth?.user ?? null;
  if (!currentRefreshToken || !currentUser) return { token: null, reason: 'auth' };

  try {
    const { data } = await axios.post(
      `${API_BASE_URL || 'http://localhost:3000'}/auth/refresh`,
      { refresh_token: currentRefreshToken },
      { timeout: Number(API_TIMEOUT) || 10000 },
    );
    useAuthStore.getState().setToken(data.access_token, currentUser, data.refresh_token);
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
