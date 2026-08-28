import axios from 'axios';

/**
 * true quando a requisição não obteve NENHUMA resposta do servidor
 * (offline, DNS, timeout). Distinguir isso de uma resposta 4xx evita
 * dizer "credenciais inválidas" para quem só está sem internet.
 */
export function isNetworkError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response == null;
}

/** Status HTTP da resposta, ou null se não houve resposta. */
export function statusOf(error: unknown): number | null {
  return axios.isAxiosError(error) ? (error.response?.status ?? null) : null;
}
