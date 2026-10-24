import api from './api';

export type InviteStatus = 'active' | 'used' | 'revoked' | 'expired';
export interface CreditInvite {
  id: string;
  label: string | null;
  status: InviteStatus;
  grant_units: number;
  created_at: string;
  expires_at: string;
  claimed_by: string | null;
  /** Acompanhamento (spec 21/10). Ausentes em respostas antigas. */
  claimed_by_name?: string | null;
  claimed_by_email?: string | null;
  claimed_at?: string | null;
  usage_since_claim?: { debited_units: number; photos: number; messages: number };
}

export interface Metric {
  value: number;
  previous: number;
}
export type AdminPeriod = 7 | 30 | 90;
export interface AdminOverview {
  periodDays: number;
  users: {
    total: number;
    newInPeriod: Metric;
    active7d: number;
    activeInPeriod: Metric;
    withActiveDiet: number;
  };
  usage: {
    photos: Metric;
    textMessages: Metric;
    voiceMessages: Metric;
    mealsLogged: Metric;
    dietsCompleted: Metric;
    dietsFailed: Metric;
  };
  credits: {
    welcomeAutoUnits: Metric;
    welcomeInviteUnits: Metric;
    /** Ausente em backends anteriores à liberação manual. */
    manualUnits?: Metric;
    consumedPhotoUnits: Metric;
    consumedMessageUnits: Metric;
    totalBalanceUnits: number;
    zeroBalanceAccounts: number;
  };
  invites: {
    created: Metric;
    redeemed: Metric;
    redemptionRate: number;
    expiredUnused: number;
    revoked: number;
  };
  ai: {
    byFeature: {
      feature: string;
      calls: number;
      totalTokens: number;
      estimatedUsd: number | null;
    }[];
    totalEstimatedUsd: number;
  };
}

export type AdminUserSort = 'recent' | 'active' | 'low_balance' | 'ai_usage';
export interface AdminUserRow {
  id: string;
  name: string | null;
  email: string | null;
  created_at: string;
  last_activity_at: string | null;
  balance_units: number;
  photos: number;
  messages: number;
  has_active_diet: boolean;
  current_streak: number;
  joined_by_invite: boolean;
  unlimited: boolean;
}

export const adminService = {
  overview: (days: AdminPeriod) =>
    api.get<AdminOverview>('/admin/overview', { params: { days } }).then((r) => r.data),
  users: (params: { q?: string; sort: AdminUserSort; cursor?: string; days: AdminPeriod }) =>
    api
      .get<{ items: AdminUserRow[]; next_cursor: string | null }>('/admin/users', {
        params: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined)),
      })
      .then((r) => r.data),
  invites: (cursor?: string, status?: InviteStatus) =>
    api
      .get<{ items: CreditInvite[]; next_cursor?: string | null }>('/admin/credit-invites', {
        params:
          cursor || status
            ? { ...(cursor ? { cursor } : {}), ...(status ? { status } : {}) }
            : undefined,
      })
      .then((r) => r.data),
  createInvite: (label: string, key: string) =>
    api
      .post<CreditInvite & { url: string | null }>(
        '/admin/credit-invites',
        { label: label.trim() || undefined },
        { headers: { 'Idempotency-Key': key } },
      )
      .then((r) => r.data),
  /** A chave vale por abertura do sheet: reenvio da mesma confirmação credita uma vez. */
  grantCredits: (userId: string, credits: number, note: string | undefined, key: string) =>
    api
      .post<{ balance_units: number; available_units: number; unlimited: boolean }>(
        `/admin/users/${userId}/credits`,
        { credits, note },
        { headers: { 'Idempotency-Key': key } },
      )
      .then((r) => r.data),
  setUnlimited: (userId: string, unlimited: boolean) =>
    api
      .put<{ unlimited: boolean }>(`/admin/users/${userId}/unlimited`, { unlimited })
      .then((r) => r.data),
  revokeInvite: (id: string) =>
    api.post<CreditInvite>(`/admin/credit-invites/${id}/revoke`, {}).then((r) => r.data),
};
