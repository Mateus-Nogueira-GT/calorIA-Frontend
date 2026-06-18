import axios from 'axios';
import { API_BASE_URL, API_TIMEOUT } from '@env';
import { useAuthStore } from '@features/auth/store';

const api = axios.create({
  baseURL: API_BASE_URL || 'http://localhost:8000',
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

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken, user, pendingAuth } = useAuthStore.getState();
  const currentRefreshToken = refreshToken ?? pendingAuth?.refreshToken ?? null;
  const currentUser = user ?? pendingAuth?.user ?? null;
  if (!currentRefreshToken || !currentUser) return null;

  try {
    const { data } = await axios.post(
      `${API_BASE_URL || 'http://localhost:8000'}/auth/refresh`,
      { refresh_token: currentRefreshToken },
      { timeout: Number(API_TIMEOUT) || 10000 },
    );
    useAuthStore.getState().setToken(data.access_token, currentUser, data.refresh_token);
    return data.access_token as string;
  } catch {
    return null;
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
      const newToken = await refreshPromise;
      if (newToken) {
        config.headers.Authorization = `Bearer ${newToken}`;
        return api(config);
      }
    }
    if (error.response?.status === 401) {
      useAuthStore.getState().clearToken();
    }
    return Promise.reject(error);
  },
);

export default api;
