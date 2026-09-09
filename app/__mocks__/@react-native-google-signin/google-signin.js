// Espelha a resposta da v16: união discriminada por `type`, com o idToken
// dentro de `data`. O mock antigo devolvia `{ idToken }` (forma pré-v13), o
// que fazia os testes passarem enquanto a produção quebrava.
module.exports = {
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(true),
    signIn: jest.fn().mockResolvedValue({
      type: 'success',
      data: { idToken: 'mock-google-token' },
    }),
  },
  statusCodes: { SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED' },
};
