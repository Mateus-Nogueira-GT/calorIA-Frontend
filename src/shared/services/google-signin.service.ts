type GoogleSignInModule = {
  GoogleSignin: {
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

export async function getGoogleIdToken(): Promise<string> {
  const googleSignInModule = loadGoogleSignInModule();

  if (!googleSignInModule) {
    throw new Error('Google Sign-In native dependency is not installed.');
  }

  const { GoogleSignin } = googleSignInModule;
  await GoogleSignin.hasPlayServices();
  const { idToken } = await GoogleSignin.signIn();

  if (!idToken) {
    throw new Error('Google Sign-In did not return an id token.');
  }

  return idToken;
}
