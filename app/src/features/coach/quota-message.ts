import axios from 'axios';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * OP2 + feedback de 27/10: o 429 AI_QUOTA_EXCEEDED dizia "Volte amanhã" sem
 * explicar nada — o usuário, com créditos na carteira, achou que o coach tinha
 * quebrado. O backend manda `details.retryAt` (quando a janela de 24 h libera);
 * aqui vira o horário local. null = não é erro de cota.
 */
export function coachQuotaMessage(e: unknown, now: Date = new Date()): string | null {
  if (!axios.isAxiosError(e) || e.response?.status !== 429) return null;
  const body = e.response.data as
    | { error?: string; details?: { retryAt?: unknown } }
    | undefined;
  if (body?.error !== 'AI_QUOTA_EXCEEDED') return null;

  const retryAt =
    typeof body.details?.retryAt === 'string' ? new Date(body.details.retryAt) : null;
  let when = 'Tente de novo mais tarde.';
  if (retryAt && !Number.isNaN(retryAt.getTime())) {
    const time = `${pad(retryAt.getHours())}:${pad(retryAt.getMinutes())}`;
    const sameDay = retryAt.toDateString() === now.toDateString();
    when = `Ele volta a responder ${sameDay ? '' : 'amanhã '}às ${time}.`;
  }
  return `Você chegou ao limite diário do coach. ${when} Nenhum crédito foi cobrado.`;
}
