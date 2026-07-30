import { GOOGLE_WEB_CLIENT_ID } from '@env';

type GoogleSignInModule = {
  GoogleSignin: {
    configure: (options: { webClientId: string }) => void;
    hasPlayServices: () => Promise<boolean>;
    signIn: () => Promise<{ idToken?: string | null }>;
  };
};

function loadGoogleSignInModule(): GoogleSignInModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-google-signin/google-signin') as GoogleSignInModule;
  } catch {
    return null;
  }
}

export const isGoogleSignInAvailable = loadGoogleSignInModule() !== null;

/** configure() só precisa rodar uma vez por processo. */
let configured = false;

export async function getGoogleIdToken(): Promise<string> {
  const googleSignInModule = loadGoogleSignInModule();

  if (!googleSignInModule) {
    throw new Error('Google Sign-In native dependency is not installed.');
  }

  // Sem configure({ webClientId }) a lib lança um erro interno críptico no
  // primeiro signIn(). Falhamos antes, com uma mensagem acionável.
  if (!GOOGLE_WEB_CLIENT_ID) {
    throw new Error(
      'GOOGLE_WEB_CLIENT_ID ausente no .env — ver docs/mobile-social-login.md',
    );
  }

  const { GoogleSignin } = googleSignInModule;
  if (!configured) {
    GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
    configured = true;
  }

  await GoogleSignin.hasPlayServices();
  const { idToken } = await GoogleSignin.signIn();

  if (!idToken) {
    throw new Error('Google Sign-In did not return an id token.');
  }

  return idToken;
}
