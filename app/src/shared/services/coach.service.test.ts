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
    id: 'm1', date: '2026-11-04', currentName: 'Carne suína', name: 'Salmão grelhado',
    weightGrams: 180, mealType: 'dinner', calories: 376, protein: 40, carbs: 0, fat: 24, fiber: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('avisa que sabe mostrar o cartão e mapeia meal_proposal', async () => {
    api.post.mockResolvedValue({
      data: {
        conversation_id: 'conv-1',
        message: { role: 'assistant', content: 'Para os mesmos 180 g…', created_at: '2026-11-05T00:00:00Z' },
        diet_generated: false, diet_id: null, diet_job_id: null,
        meal_proposal: proposal,
      },
    });
    const r = await coachService.sendMessage('não era suína', null);
    const body = api.post.mock.calls.find(([url]: [string]) => url === '/chat/message')?.[1];
    expect(body).toMatchObject({ client_features: ['meal_proposal'] });
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
    expect(h.messages.map((m: { timestamp: string | null }) => m.timestamp)).toEqual([null, '2026-11-02T13:00:00.000Z']);
  });
});
