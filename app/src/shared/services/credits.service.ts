import api from './api';

export interface Wallet {
  balance_units: number;
  reserved_units: number;
  available_units: number;
  units_per_credit: number;
  enforcement_enabled: boolean;
  invites_enabled: boolean;
  policy: { photo_units: number; message_units: number; welcome_units: number; version: string };
}
export interface LedgerEntry {
  id: string;
  units: number;
  kind: 'welcome' | 'debit';
  operation_id: string | null;
  created_at: string;
}
export interface CreditOperation {
  id: string;
  type: string;
  state: 'reserved' | 'running' | 'succeeded' | 'failed' | 'uncertain';
  cost_units: number;
  result?: unknown;
}
export const formatCredits = (units: number, unitsPerCredit = 5): string =>
  (units / unitsPerCredit).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

export const creditsService = {
  wallet: () => api.get<Wallet>('/credits/me').then((r) => r.data),
  ledger: (cursor?: string) =>
    api
      .get<{ items: LedgerEntry[]; next_cursor: string | null }>('/credits/ledger', {
        params: cursor ? { cursor } : undefined,
      })
      .then((r) => r.data),
  operation: (key: string) =>
    api
      .get<CreditOperation>(`/credits/operations/by-key/${encodeURIComponent(key)}`)
      .then((r) => r.data),
};

/** Stable operation keys are identifiers, never credentials or invite tokens. */
export function newOperationKey(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const n = Math.floor(Math.random() * 16);
    return (c === 'x' ? n : (n & 3) | 8).toString(16);
  });
}

export function creditErrorMessage(error: unknown): string | null {
  const body = (error as { response?: { data?: { error?: string } } })?.response?.data;
  if ((error as { code?: string })?.code === 'LOCAL_OPERATION_STORAGE')
    return 'Não foi possível guardar sua tentativa no aparelho. Libere o armazenamento e tente novamente. Nenhuma solicitação foi enviada.';
  switch (body?.error) {
    case 'INSUFFICIENT_CREDITS':
      return 'Créditos insuficientes. Consulte seu saldo no Perfil. Sua mensagem ou foto foi preservada.';
    case 'CREDITS_UNAVAILABLE':
      return 'Não foi possível consultar os créditos. Tente novamente em instantes.';
    case 'CREDIT_POLICY_UNDEFINED':
    case 'CREDIT_POLICY_UNAVAILABLE':
      return 'Esta função está aguardando a definição da tarifa de créditos.';
    case 'OPERATION_PENDING':
    case 'CREDIT_OPERATION_PENDING':
    case 'CONVERSATION_BUSY':
      return 'Sua solicitação ainda está em processamento. Aguarde e tente novamente para recuperar o resultado.';
    case 'OPERATION_FAILED':
    case 'OPERATION_CANCELLED':
    case 'OPERATION_EXPIRED':
      return 'Esta tentativa terminou sem resultado. Tente novamente para iniciar uma nova solicitação.';
    case 'IDEMPOTENCY_KEY_REQUIRED':
    case 'CLIENT_UPDATE_REQUIRED':
      return 'Atualize o aplicativo para continuar.';
    default:
      return null;
  }
}

const creditChangeListeners = new Set<() => void>();
export function subscribeCreditChange(listener: () => void): () => void {
  creditChangeListeners.add(listener);
  return () => {
    creditChangeListeners.delete(listener);
  };
}
/** Wallet refresh listeners cannot invalidate a delivered AI result. */
export function notifyCreditChange(): void {
  for (const listener of creditChangeListeners) {
    try {
      listener();
    } catch {
      /* Refresh failures are shown by the wallet. */
    }
  }
}
