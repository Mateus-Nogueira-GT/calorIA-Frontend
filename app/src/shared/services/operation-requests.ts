import axios from 'axios';
import { captureSessionOwner, isCurrentOwner } from './session-owner';
import { newOperationKey } from './credits.service';
import { kvStorage } from './storage';

export interface PendingRequest {
  key: string;
  type: 'photo' | 'chat';
  signature: string;
  created_at: string;
  date?: string;
  tzOffsetMinutes?: number;
}

/** A local matching hint only; the server validates the full payload with SHA-256. */
function signature(payload: string): string {
  let a = 2166136261;
  let b = 5381;
  for (let i = 0; i < payload.length; i++) {
    a = Math.imul(a ^ payload.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ payload.charCodeAt(i);
  }
  return `${payload.length}:${a >>> 0}:${b >>> 0}`;
}
const storageKey = (userId: string) => `caloria:pending-operations:${userId}`;
const active = new Map<string, PendingRequest>();
const completed = new Set<string>();
const writes = new Map<string, Promise<unknown>>();

/** Serialize read/modify/write so photo and chat metadata cannot erase each other. */
async function serialized<T>(owner: string, action: () => Promise<T>): Promise<T> {
  const previous = writes.get(owner) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(action);
  writes.set(owner, next);
  try {
    return await next;
  } finally {
    if (writes.get(owner) === next) writes.delete(owner);
  }
}

export async function beginRequest(
  type: PendingRequest['type'],
  payload: string,
  context?: { date: string; tzOffsetMinutes: number },
): Promise<PendingRequest> {
  const owner = captureSessionOwner();
  const userId = owner.userId;
  const sig = signature(payload);
  const slot = `${userId}:${type}:${sig}`;
  return serialized(userId ?? 'guest', async () => {
    const list = userId ? await pendingRequests(userId) : [];
    if (!isCurrentOwner(owner)) throw new axios.CanceledError();
    const previous =
      active.get(slot) ?? list.find((item) => item.type === type && item.signature === sig);
    if (previous && !completed.has(previous.key)) {
      active.set(slot, previous);
      return previous;
    }
    const next: PendingRequest = {
      key: newOperationKey(),
      type,
      signature: sig,
      created_at: new Date().toISOString(),
      ...context,
    };
    if (userId) {
      // Never store photos, message text or invite tokens. Keep all unresolved
      // operations so a later different request does not hide timeout recovery.
      const encoded = JSON.stringify([...list, next]);
      await kvStorage.setItem(storageKey(userId), encoded);
      // The shared web adapter tolerates blocked localStorage. For billable
      // requests, verify durability before allowing a provider call.
      if ((await kvStorage.getItem(storageKey(userId))) !== encoded) {
        throw Object.assign(
          new Error('Não foi possível guardar a tentativa com segurança. Tente novamente.'),
          { code: 'LOCAL_OPERATION_STORAGE' },
        );
      }
    }
    active.set(slot, next);
    if (!isCurrentOwner(owner)) throw new axios.CanceledError();
    return next;
  });
}

export async function pendingRequests(userId: string): Promise<PendingRequest[]> {
  const raw = await kvStorage.getItem(storageKey(userId));
  if (!raw) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error('Registro de solicitação inválido');
  return data.filter((r): r is PendingRequest =>
    Boolean(
      r &&
      typeof r === 'object' &&
      typeof r.key === 'string' &&
      /^[A-Za-z0-9_-]{16,128}$/.test(r.key) &&
      (r.type === 'photo' || r.type === 'chat') &&
      typeof r.signature === 'string' &&
      typeof r.created_at === 'string' &&
      (r.date === undefined || typeof r.date === 'string') &&
      (r.tzOffsetMinutes === undefined || typeof r.tzOffsetMinutes === 'number') &&
      !completed.has(r.key),
    ),
  );
}

/** Cleanup is best effort: a delivered, charged result must stay successful.
 * If storage is unavailable, stale metadata can remain after process restart;
 * the server still replays its saved result instead of charging the key twice.
 */
export async function finishRequest(request: PendingRequest, userId?: string): Promise<void> {
  completed.add(request.key);
  for (const [slot, item] of active) if (item.key === request.key) active.delete(slot);
  if (!userId) return;
  try {
    await serialized(userId, async () => {
      const list = await pendingRequests(userId);
      await kvStorage.setItem(
        storageKey(userId),
        JSON.stringify(list.filter((r) => r.key !== request.key)),
      );
    });
  } catch {
    /* The receipt/result, rather than local cleanup, determines success. */
  }
}

export function isDefinitiveRejection(error: unknown): boolean {
  const response = (error as { response?: { status?: number; data?: { error?: string } } })
    ?.response;
  // A fenced, terminal operation needs a fresh key when the user explicitly retries.
  if (
    response?.status === 409 &&
    ['OPERATION_FAILED', 'OPERATION_EXPIRED', 'OPERATION_CANCELLED'].includes(response.data?.error ?? '')
  )
    return true;
  const status = response?.status;
  if (status === undefined) return false;
  // 5xx/429 com código do NOSSO servidor: o backend lançou o erro dentro da
  // operação, marcou-a como failed e liberou a reserva. Reusar a chave só
  // devolveria 409 OPERATION_FAILED e o "Tentar novamente" exigiria dois toques.
  // Ambíguos mantêm a chave: CREDITS_UNAVAILABLE (pede consulta antes de
  // reenviar), TOO_MANY_REQUESTS (barrado antes de existir operação) e respostas
  // sem código nosso (gateway/timeout), em que o resultado pode já existir.
  const code = typeof response?.data?.error === 'string' ? response.data.error : undefined;
  if ((status >= 500 || status === 429) && code && !AMBIGUOUS_SERVER_ERRORS.includes(code))
    return true;
  return status >= 400 && status < 500 && ![408, 409, 429].includes(status);
}

const AMBIGUOUS_SERVER_ERRORS = ['CREDITS_UNAVAILABLE', 'TOO_MANY_REQUESTS', 'OPERATION_PENDING'];
