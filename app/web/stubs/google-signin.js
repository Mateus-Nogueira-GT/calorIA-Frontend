// Stub para rodar no navegador — login social via Google não é suportado na build web.
// O módulo nativo @react-native-google-signin/google-signin não roda fora de iOS/Android.
module.exports = {
  GoogleSignin: {
    configure: () => {},
    hasPlayServices: () => Promise.resolve(true),
    signIn: () => Promise.reject(new Error('Login com Google não está disponível na versão web.')),
  },
  statusCodes: { SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED' },
};
