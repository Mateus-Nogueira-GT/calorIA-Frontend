import api from './api';
export interface CreditInvite {
  id: string;
  label: string | null;
  status: 'active' | 'used' | 'revoked' | 'expired';
  grant_units: number;
  created_at: string;
  expires_at: string;
  claimed_by: string | null;
}
export const adminService = {
  invites: (cursor?: string) =>
    api
      .get<{ items: CreditInvite[]; next_cursor?: string | null }>('/admin/credit-invites', {
        params: cursor ? { cursor } : undefined,
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
  revokeInvite: (id: string) =>
    api.post<CreditInvite>(`/admin/credit-invites/${id}/revoke`, {}).then((r) => r.data),
};
