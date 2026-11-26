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
  /** Entra no hash do payload no servidor: o retry precisa reenviar igual. */
  inputMode?: 'voice';
  /** Conversa do chat (não é texto de mensagem): limita o `acknowledgeRequest`. */
  scope?: string | null;
  /** Outra mensagem da conversa foi entregue depois: só fica para recuperação. */
  superseded?: boolean;
}

/**
 * Pendência mais velha que isto não é reaproveitada por um envio novo com o
 * mesmo texto (só pelo retry explícito). O lease do servidor é de 5 min
 * (credits.service.ts); a janela fica acima dele.
 */
export const REUSE_WINDOW_MS = 10 * 60 * 1000;

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
const superseded = new Set<string>();
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

function reusable(item: PendingRequest, retry: boolean): boolean {
  if (completed.has(item.key) || superseded.has(item.key) || item.superseded) return false;
  // A janela é só do chat (R1); foto ambígua mantém a chave para o replay.
  if (retry || item.type !== 'chat') return true;
  const age = Date.now() - Date.parse(item.created_at);
  return Number.isFinite(age) && age < REUSE_WINDOW_MS;
}

export async function beginRequest(
  type: PendingRequest['type'],
  payload: string,
  context?: {
    date: string;
    tzOffsetMinutes: number;
    inputMode?: 'voice';
    scope?: string | null;
  },
  options?: { retry?: boolean },
): Promise<PendingRequest> {
  const owner = captureSessionOwner();
  const userId = owner.userId;
  const sig = signature(payload);
  const slot = `${userId}:${type}:${sig}`;
  return serialized(userId ?? 'guest', async () => {
    const list = userId ? await pendingRequests(userId) : [];
    if (!isCurrentOwner(owner)) throw new axios.CanceledError();
    // R1 (25/11): a pendência serve ao retry, mas não a um envio novo depois
    // de outra mensagem entregue ou fora da janela curta.
    const retry = options?.retry === true;
    const inMemory = active.get(slot);
    const previous =
      inMemory && reusable(inMemory, retry)
        ? inMemory
        : list
            .filter((item) => item.type === type && item.signature === sig)
            .reverse()
            .find((item) => reusable(item, retry));
    if (previous) {
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
      (r.inputMode === undefined || r.inputMode === 'voice') &&
      (r.scope === undefined || r.scope === null || typeof r.scope === 'string') &&
      (r.superseded === undefined || typeof r.superseded === 'boolean') &&
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
 * Entrega reconhecida de uma mensagem de chat: além de aposentar a chave, as
 * pendências anteriores da mesma conversa deixam de ser reaproveitadas por um
 * envio novo com o mesmo texto (R1, 25/11). Elas continuam listadas para a
 * recuperação em Créditos.
 */
export async function acknowledgeRequest(request: PendingRequest, userId?: string): Promise<void> {
  // Aposenta a chave já (parte síncrona do finishRequest), antes de qualquer await.
  const finished = finishRequest(request, userId);
  if (request.type !== 'chat') return finished;
  const scope = request.scope ?? null;
  // Empate de horário conta como anterior: só tira a pendência do reuso.
  const earlier = (item: PendingRequest) =>
    item.type === 'chat' &&
    item.key !== request.key &&
    (item.scope ?? null) === scope &&
    item.created_at <= request.created_at;
  for (const [slot, item] of active)
    if (earlier(item)) {
      superseded.add(item.key);
      active.delete(slot);
    }
  await finished;
  if (!userId) return;
  try {
    await serialized(userId, async () => {
      const list = await pendingRequests(userId);
      if (!list.some((item) => earlier(item) && !item.superseded)) return;
      const next = list.map((item) => {
        if (!earlier(item) || item.superseded) return item;
        superseded.add(item.key);
        return { ...item, superseded: true };
      });
      await kvStorage.setItem(storageKey(userId), JSON.stringify(next));
    });
  } catch {
    /* Best effort, como finishRequest: o servidor ainda protege a chave. */
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
    // IDEMPOTENCY_CONFLICT: a chave pertence a outro payload; reusar daria 409 sempre.
    [
      'OPERATION_FAILED',
      'OPERATION_EXPIRED',
      'OPERATION_CANCELLED',
      'IDEMPOTENCY_CONFLICT',
    ].includes(response.data?.error ?? '')
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
