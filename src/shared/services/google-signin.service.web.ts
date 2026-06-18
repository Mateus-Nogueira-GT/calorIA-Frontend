export const isGoogleSignInAvailable = false;

export async function getGoogleIdToken(): Promise<string> {
  throw new Error('Google Sign-In is not available on web.');
}
