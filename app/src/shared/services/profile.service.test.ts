import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('./api', () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('./api').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { profileService } = require('./profile.service');

describe('profileService.uploadAvatar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * R2: o avatar e o scanner mandam O MESMO payload (pickImage: base64, 1024px,
   * q0.8). O scanner já tinha subido para 75s; o avatar ficou nos 10s do
   * API_TIMEOUT e estourava no aparelho — e o avatar ainda faz mais trabalho de
   * servidor por request (Storage + getPublicUrl + UPDATE + list + remove).
   */
  it('usa timeout ampliado, igual ao do scanner', async () => {
    api.post.mockResolvedValue({ data: { avatar_url: 'https://x/y.jpg' } });

    await profileService.uploadAvatar('data:image/jpeg;base64,AAA');

    const [url, body, config] = api.post.mock.calls[0];
    expect(url).toBe('/users/me/avatar');
    expect(body).toEqual({ image: 'data:image/jpeg;base64,AAA' });
    expect(config?.timeout).toBe(75000);
  });
});
