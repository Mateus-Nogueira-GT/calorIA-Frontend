export const isAppleSignInAvailable = false;

export async function getAppleSignInPayload(): Promise<never> {
  throw new Error('Apple Sign-In is not available on web.');
}
