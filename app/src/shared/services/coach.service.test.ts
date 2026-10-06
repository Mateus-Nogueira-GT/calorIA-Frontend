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
