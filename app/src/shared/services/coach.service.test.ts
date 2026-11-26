import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('./api', () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn() },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('./api').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { coachService } = require('./coach.service');

describe('coachService.transcribe', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('manda base64 + mimeType para /chat/transcribe e devolve o texto', async () => {
    api.post.mockResolvedValue({ data: { text: 'quantas calorias tem um ovo' } });

    const text = await coachService.transcribe('QUFBQQ==', 'audio/m4a');

    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe('/chat/transcribe');
    expect(body).toEqual({ audio: 'QUFBQQ==', mimeType: 'audio/m4a' });
    expect(text).toBe('quantas calorias tem um ovo');
  });

  // O backend espera o provedor até 55 s; o cliente precisa esperar mais que isso.
  it('usa timeout de 65 s', async () => {
    api.post.mockResolvedValue({ data: { text: 'oi' } });
    await coachService.transcribe('QUFBQQ==', 'audio/m4a');
    const config = api.post.mock.calls[0][2] as { timeout: number };
    expect(config.timeout).toBe(65000);
  });
});

describe('cancelamento do transporte de voz', () => {
  it('propaga sinal sem mudar timeout e payload da transcrição', async () => {
    api.post.mockClear();
    api.post.mockResolvedValue({ data: { text: 'oi' } });
    const controller = new AbortController();
    await coachService.transcribe('QUFBQQ==', 'audio/m4a', controller.signal);
    expect(api.post).toHaveBeenCalledWith(
      '/chat/transcribe',
      { audio: 'QUFBQQ==', mimeType: 'audio/m4a' },
      { timeout: 65000, signal: controller.signal },
    );
  });
  it('contexto invalidado não inicia chamada de mensagem', async () => {
    api.post.mockClear();
    await expect(
      coachService.sendMessage('antiga', null, {
        signal: new AbortController().signal,
        isValid: () => false,
      }),
    ).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe('cancelamento idempotente do coach', () => {
  it('abortar a voz pede cancelamento ao servidor com a chave original e sem sinal abortado', async () => {
    api.post.mockClear();
    let rejectMessage!: (error: unknown) => void;
    api.post.mockImplementation((url: string) =>
      url === '/chat/message'
        ? new Promise((_resolve, reject) => {
            rejectMessage = reject;
          })
        : Promise.resolve({ data: { state: 'cancelled' } }),
    );
    const controller = new AbortController();
    const promise = coachService.sendMessage('mensagem de voz', null, {
      signal: controller.signal,
      isValid: () => true,
    });
    for (let i = 0; i < 10 && api.post.mock.calls.length === 0; i++) await Promise.resolve();
    controller.abort();
    expect(api.post.mock.calls[1][0]).toMatch(
      /^\/credits\/operations\/by-key\/[A-Za-z0-9_-]+\/cancel$/,
    );
    expect(api.post.mock.calls[1][1]).toEqual({});
    expect(api.post.mock.calls[1][2]).toEqual({
      caloriaOwner: expect.objectContaining({ generation: expect.any(Number) }),
      signal: expect.objectContaining({ aborted: false }),
    });
    expect(api.post.mock.calls[1][2].signal).not.toBe(controller.signal);
    rejectMessage(Object.assign(new Error('cancelled'), { code: 'ERR_CANCELED' }));
    await expect(promise).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  });
});

describe('coachService.speak', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('pede /chat/speech com o id e a resposta esperada e repassa a vinculação ao dono', async () => {
    api.post.mockResolvedValue({ data: { audio: 'SUQz', mimeType: 'audio/mpeg' } });
    const signal = new AbortController().signal;
    const result = await coachService.speak('conv-1', { signal }, 'Beba água.');
    const [url, body, config] = api.post.mock.calls[0];
    expect(url).toBe('/chat/speech');
    expect(body).toEqual({ conversation_id: 'conv-1', expected_reply: 'Beba água.' });
    expect(config).toMatchObject({ timeout: 40000, signal });
    expect(result).toEqual({ audio: 'SUQz', mimeType: 'audio/mpeg' });
  });
});

describe('coachService.sendMessage — modo de entrada', () => {
  const reply = {
    data: {
      conversation_id: 'conv-1',
      message: { role: 'assistant', content: 'ok', created_at: '2026-10-21T00:00:00Z' },
      diet_generated: false,
      diet_id: null,
      diet_job_id: null,
    },
  };
  const messageBody = () =>
    api.post.mock.calls.find(([url]: [string]) => url === '/chat/message')?.[1];

  beforeEach(() => {
    jest.clearAllMocks();
    api.post.mockResolvedValue(reply);
  });

  it('mensagem de voz avisa o servidor com input_mode voice', async () => {
    await coachService.sendMessage('falado', null, {
      signal: new AbortController().signal,
      isValid: () => true,
    });
    expect(messageBody()).toMatchObject({ message: 'falado', input_mode: 'voice' });
  });

  it('mensagem digitada não envia input_mode', async () => {
    await coachService.sendMessage('digitado', null);
    expect(messageBody()).not.toHaveProperty('input_mode');
  });
});

describe('coachService — varredura de 05/11', () => {
  const proposal = {
    id: 'm1',
    date: '2026-11-04',
    currentName: 'Carne suína',
    name: 'Salmão grelhado',
    weightGrams: 180,
    mealType: 'dinner',
    calories: 376,
    protein: 40,
    carbs: 0,
    fat: 24,
    fiber: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('avisa que sabe mostrar o cartão e mapeia meal_proposal', async () => {
    api.post.mockResolvedValue({
      data: {
        conversation_id: 'conv-1',
        message: {
          role: 'assistant',
          content: 'Para os mesmos 180 g…',
          created_at: '2026-11-05T00:00:00Z',
        },
        diet_generated: false,
        diet_id: null,
        diet_job_id: null,
        meal_proposal: proposal,
      },
    });
    const r = await coachService.sendMessage('não era suína', null);
    const body = api.post.mock.calls.find(([url]: [string]) => url === '/chat/message')?.[1];
    expect(body).toMatchObject({
      client_features: ['meal_proposal', 'log_meal', 'log_weight', 'complete_plan_meal'],
    });
    expect(r.message.mealProposal).toEqual(proposal);
  });

  it('histórico usa a hora gravada; sem ela, timestamp null', async () => {
    api.get.mockResolvedValue({
      data: {
        status: 'collecting',
        messages: [
          { role: 'user', content: 'antiga' },
          { role: 'assistant', content: 'nova', created_at: '2026-11-02T13:00:00.000Z' },
        ],
      },
    });
    const h = await coachService.getHistory('conv-1');
    expect(h.messages.map((m: { timestamp: string | null }) => m.timestamp)).toEqual([
      null,
      '2026-11-02T13:00:00.000Z',
    ]);
  });
});

it('mapeia action_proposal (05/11, ações com cartão)', async () => {
  const action = {
    kind: 'log_weight',
    weightKg: 78,
    date: '2026-11-05',
    replaces: null,
    bigChange: false,
  };
  api.post.mockResolvedValue({
    data: {
      conversation_id: 'conv-1',
      message: {
        role: 'assistant',
        content: 'Toque para salvar.',
        created_at: '2026-11-05T00:00:00Z',
      },
      diet_generated: false,
      diet_id: null,
      diet_job_id: null,
      action_proposal: action,
    },
  });
  const r = await coachService.sendMessage('meu peso é 78', null);
  expect(r.message.actionProposal).toEqual(action);
});

describe('coachService.sendMessage — chave de tentativa (pente fino 25/11)', () => {
  const ok = (conversationId: string) => ({
    data: {
      conversation_id: conversationId,
      message: { role: 'assistant', content: 'ok', created_at: '2026-11-25T00:00:00Z' },
      diet_generated: false,
      diet_id: null,
      diet_job_id: null,
    },
  });
  const networkError = () => Object.assign(new Error('Network Error'), { isAxiosError: true });
  const messageCalls = () =>
    api.post.mock.calls.filter(([url]: [string]) => url === '/chat/message');
  const keyOf = (i: number) => messageCalls()[i][2].headers['Idempotency-Key'];
  const bodyOf = (i: number) => messageCalls()[i][1];
  const voice = () => ({ signal: new AbortController().signal, isValid: () => true });

  beforeEach(() => {
    jest.clearAllMocks();
    api.post.mockReset();
  });

  it('R1: "sim" que falhou não reaproveita a chave depois de outra mensagem entregue', async () => {
    const conv = '11111111-1111-4111-8111-111111111111';
    api.post.mockRejectedValueOnce(networkError());
    await expect(coachService.sendMessage('sim', conv)).rejects.toThrow();
    api.post.mockResolvedValueOnce(ok(conv));
    await (await coachService.sendMessage('quero almoçar', conv)).acknowledge();
    api.post.mockResolvedValueOnce(ok(conv));
    await coachService.sendMessage('sim', conv);
    expect(keyOf(2)).not.toBe(keyOf(0));
  });

  it('R1: retry imediato, sem nada entre as tentativas, mantém a chave', async () => {
    const conv = '33333333-3333-4333-8333-333333333333';
    api.post.mockRejectedValueOnce(networkError());
    await expect(coachService.sendMessage('sim', conv)).rejects.toThrow();
    api.post.mockResolvedValueOnce(ok(conv));
    await coachService.sendMessage('sim', conv);
    expect(keyOf(1)).toBe(keyOf(0));
  });

  it('R1: pendência mais velha que a janela não é reaproveitada por um envio novo', async () => {
    const conv = '44444444-4444-4444-8444-444444444444';
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      api.post.mockRejectedValueOnce(networkError());
      await expect(coachService.sendMessage('sim', conv)).rejects.toThrow();
      jest.setSystemTime(Date.now() + 11 * 60 * 1000);
      // Retry explícito ("Tentar novamente") ainda recupera a mesma tentativa.
      api.post.mockRejectedValueOnce(networkError());
      await expect(
        coachService.sendMessage('sim', conv, undefined, { retry: true }),
      ).rejects.toThrow();
      api.post.mockResolvedValueOnce(ok(conv));
      await coachService.sendMessage('sim', conv);
      expect(keyOf(1)).toBe(keyOf(0));
      expect(keyOf(2)).not.toBe(keyOf(0));
    } finally {
      jest.useRealTimers();
    }
  });

  it('R2: retry de mensagem de voz reenvia input_mode voice com a mesma chave', async () => {
    const conv = '22222222-2222-4222-8222-222222222222';
    api.post.mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }));
    await expect(coachService.sendMessage('comi um ovo', conv, voice())).rejects.toThrow();
    api.post.mockResolvedValueOnce(ok(conv));
    await coachService.sendMessage('comi um ovo', conv, undefined, { retry: true });
    expect(keyOf(1)).toBe(keyOf(0));
    expect(bodyOf(0).input_mode).toBe('voice');
    expect(bodyOf(1).input_mode).toBe('voice');
  });

  it('R2: 409 IDEMPOTENCY_CONFLICT libera a chave para o próximo envio', async () => {
    const conv = '55555555-5555-4555-8555-555555555555';
    api.post.mockRejectedValueOnce({
      response: { status: 409, data: { error: 'IDEMPOTENCY_CONFLICT' } },
    });
    await expect(coachService.sendMessage('oi', conv)).rejects.toBeDefined();
    api.post.mockResolvedValueOnce(ok(conv));
    await coachService.sendMessage('oi', conv);
    expect(keyOf(1)).not.toBe(keyOf(0));
  });
});
