import { coachQuotaMessage } from './quota-message';

const quota = (details?: Record<string, unknown>) =>
  Object.assign(new Error('429'), {
    isAxiosError: true,
    response: { status: 429, data: { error: 'AI_QUOTA_EXCEEDED', ...(details ? { details } : {}) } },
  });

const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

describe('coachQuotaMessage', () => {
  const now = new Date(2026, 9, 28, 15, 0);

  it('com retryAt no mesmo dia: diz a hora e que nada foi cobrado', () => {
    const at = new Date(2026, 9, 28, 19, 5);
    expect(coachQuotaMessage(quota({ retryAt: at.toISOString() }), now)).toBe(
      `Você chegou ao limite diário do coach. Ele volta a responder às ${hhmm(at)}. Nenhum crédito foi cobrado.`,
    );
  });

  it('com retryAt no dia seguinte: diz "amanhã às"', () => {
    const at = new Date(2026, 9, 29, 9, 30);
    expect(coachQuotaMessage(quota({ retryAt: at.toISOString() }), now)).toBe(
      `Você chegou ao limite diário do coach. Ele volta a responder amanhã às ${hhmm(at)}. Nenhum crédito foi cobrado.`,
    );
  });

  it('sem retryAt (ou inválido): mensagem sem horário', () => {
    const fallback =
      'Você chegou ao limite diário do coach. Tente de novo mais tarde. Nenhum crédito foi cobrado.';
    expect(coachQuotaMessage(quota(), now)).toBe(fallback);
    expect(coachQuotaMessage(quota({ retryAt: 'x' }), now)).toBe(fallback);
  });

  it('não é erro de cota → null', () => {
    expect(coachQuotaMessage(new Error('rede'), now)).toBeNull();
    const rate = Object.assign(new Error('429'), {
      isAxiosError: true,
      response: { status: 429, data: { error: 'TOO_MANY_REQUESTS' } },
    });
    expect(coachQuotaMessage(rate, now)).toBeNull();
  });
});
