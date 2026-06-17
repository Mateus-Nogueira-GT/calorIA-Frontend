declare module '@react-native-google-signin/google-signin' {
  export const GoogleSignin: {
    hasPlayServices: () => Promise<boolean>;
    signIn: () => Promise<{ idToken: string | null }>;
  };
}
