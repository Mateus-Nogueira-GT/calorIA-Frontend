import { Platform } from 'react-native';

type AppleFullName = {
  givenName?: string | null;
  familyName?: string | null;
};

type AppleAuthModule = {
  appleAuth: {
    performRequest: (options: {
      requestedOperation: string;
      requestedScopes: string[];
    }) => Promise<{
      identityToken?: string | null;
      fullName?: AppleFullName | null;
    }>;
    Operation: {
      LOGIN: string;
    };
    Scope: {
      EMAIL: string;
      FULL_NAME: string;
    };
  };
};

export type AppleSignInPayload = {
  identityToken: string;
  fullName?: string;
};

function loadAppleSignInModule(): AppleAuthModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@invertase/react-native-apple-authentication') as AppleAuthModule;
  } catch {
    return null;
  }
}

function formatFullName(fullName?: AppleFullName | null): string | undefined {
  if (!fullName) {
    return undefined;
  }

  const value = [fullName.givenName, fullName.familyName]
    .filter((part): part is string => Boolean(part))
    .join(' ')
    .trim();

  return value || undefined;
}

export const isAppleSignInAvailable = Platform.OS === 'ios' && loadAppleSignInModule() !== null;

export async function getAppleSignInPayload(): Promise<AppleSignInPayload> {
  const appleSignInModule = loadAppleSignInModule();

  if (!appleSignInModule) {
    throw new Error('Apple Sign-In native dependency is not installed.');
  }

  const { appleAuth } = appleSignInModule;
  const credential = await appleAuth.performRequest({
    requestedOperation: appleAuth.Operation.LOGIN,
    requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
  });

  if (!credential.identityToken) {
    throw new Error('Apple Sign-In did not return an identity token.');
  }

  return {
    identityToken: credential.identityToken,
    fullName: formatFullName(credential.fullName),
  };
}
