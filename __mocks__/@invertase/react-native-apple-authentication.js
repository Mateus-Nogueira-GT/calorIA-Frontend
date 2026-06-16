module.exports = {
  appleAuth: {
    performRequest: jest.fn().mockResolvedValue({ identityToken: 'mock-apple-token' }),
    Operation: { LOGIN: 'LOGIN' },
    Scope: { EMAIL: 'EMAIL', FULL_NAME: 'FULL_NAME' },
  },
};
