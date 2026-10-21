import axios from 'axios';
import { captureSessionOwner, isCurrentOwner } from './session-owner';
import { newOperationKey } from './credits.service';
import { kvStorage } from './storage';
import { withStorageLock } from './storage-lock';

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

/**
 * Serialize read/modify/write so photo and chat metadata cannot erase each other:
 * in memory within this runtime, and with a Web Lock across browser tabs (D04).
 */
async function serialized<T>(owner: string, action: () => Promise<T>): Promise<T> {
  const previous = writes.get(owner) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => withStorageLock(storageKey(owner), action));
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

/**
 * 5xx codes our backend throws inside the credit operation's inference or its
 * settlement transaction, before any debit commits. runCreditOperation then
 * fences the operation as failed and releases the reservation
 * (backend/src/modules/credits/credits.service.ts, settle/catch), so reusing
 * the key would only return 409 OPERATION_FAILED. Origins:
 * - VISION_ERROR: backend/src/modules/scanner/scanner.service.ts
 * - AI_TIMEOUT, AI_UNAVAILABLE, AI_ERROR, AI_TRUNCATED: backend/src/modules/chat/chat.service.ts
 * - HISTORY_WRITE_FAILED: chat.service.ts persistHistory, inside the settlement tx
 * - TRANSCRIBE_FAILED: backend/src/modules/chat/transcribe.service.ts
 */
export const FAILED_BEFORE_SETTLEMENT = [
  'VISION_ERROR',
  'AI_ERROR',
  'AI_UNAVAILABLE',
  'AI_TIMEOUT',
  'AI_TRUNCATED',
  'TRANSCRIBE_FAILED',
  'HISTORY_WRITE_FAILED',
] as const;

export function isDefinitiveRejection(error: unknown): boolean {
  const response = (error as { response?: { status?: number; data?: { error?: string } } })
    ?.response;
  // A fenced, terminal operation needs a fresh key when the user explicitly retries.
  if (
    response?.status === 409 &&
    ['OPERATION_FAILED', 'OPERATION_EXPIRED', 'OPERATION_CANCELLED'].includes(
      response.data?.error ?? '',
    )
  )
    return true;
  const status = response?.status;
  if (status === undefined) return false;
  const code = typeof response?.data?.error === 'string' ? response.data.error : undefined;
  // 5xx: só é definitivo o que comprovadamente falhou antes da liquidação. Um
  // INTERNAL_SERVER_ERROR, código desconhecido ou corpo de gateway pode ter
  // chegado DEPOIS do commit do débito — reusar a chave devolve o resultado
  // salvo (ou 409 OPERATION_FAILED, que libera chave nova) sem cobrar de novo.
  if (status >= 500)
    return code !== undefined && (FAILED_BEFORE_SETTLEMENT as readonly string[]).includes(code);
  // 429 com código nosso vem de dentro da operação (ex.: cota de IA);
  // TOO_MANY_REQUESTS é barrado antes de existir operação.
  if (status === 429) return code !== undefined && code !== 'TOO_MANY_REQUESTS';
  return status >= 400 && status < 500 && ![408, 409].includes(status);
}
