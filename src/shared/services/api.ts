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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().clearToken();
    }
    return Promise.reject(error);
  },
);

export default api;
