import { GOOGLE_WEB_CLIENT_ID } from '@env';

/**
 * A partir da v13 a lib deixou de devolver o usuário direto de `signIn()` e
 * passou a devolver uma união discriminada por `type`:
 *
 *   { type: 'success', data: { idToken, user, ... } } | { type: 'cancelled', data: null }
 *
 * O código antigo fazia `const { idToken } = await signIn()`, que na v16 é
 * sempre `undefined` — o login falharia 100% das vezes em produção.
 */
type GoogleUser = {
  idToken: string | null;
};

export type GoogleSignInResponse =
  | { type: 'success'; data: GoogleUser }
  | { type: 'cancelled'; data: null };

type GoogleSignInModule = {
  GoogleSignin: {
    configure: (options: { webClientId: string }) => void;
    hasPlayServices: () => Promise<boolean>;
    signIn: () => Promise<GoogleSignInResponse>;
  };
};

/** Erro dedicado para o usuário desistir do fluxo — não é falha de login. */
export class GoogleSignInCancelledError extends Error {
  constructor() {
    super('Google Sign-In cancelled by the user.');
    this.name = 'GoogleSignInCancelledError';
  }
}

/**
 * Separado de `getGoogleIdToken` porque é AQUI que mora a incompatibilidade de
 * versão, e porque o resto da função depende de `GOOGLE_WEB_CLIENT_ID` — que o
 * babel-plugin react-native-dotenv inlina em tempo de compilação a partir do
 * `.env`, e portanto não dá para variar em teste.
 */
export function extractIdToken(response: GoogleSignInResponse): string {
  if (response?.type !== 'success') {
    throw new GoogleSignInCancelledError();
  }

  const { idToken } = response.data;

  if (!idToken) {
    throw new Error('Google Sign-In did not return an id token.');
  }

  return idToken;
}

function loadGoogleSignInModule(): GoogleSignInModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-google-signin/google-signin') as GoogleSignInModule;
  } catch {
    return null;
  }
}

/**
 * A lib instalada NÃO basta: sem `GOOGLE_WEB_CLIENT_ID` o `signIn()` sempre
 * falha. Mostrar um botão que só sabe dar erro é pior do que não mostrar —
 * e, na App Store, oferecer login do Google dispara a exigência de Sign in
 * with Apple (diretriz 4.8), então um build sem credencial não deve anunciar
 * login social nenhum.
 */
export const isGoogleSignInAvailable =
  loadGoogleSignInModule() !== null && Boolean(GOOGLE_WEB_CLIENT_ID);

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

  return extractIdToken(await GoogleSignin.signIn());
}
