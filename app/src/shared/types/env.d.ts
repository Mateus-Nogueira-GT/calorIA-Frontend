declare module '@env' {
  export const API_BASE_URL: string;
  export const API_TIMEOUT: string;
  /** URL pública do web app — fallback dos convites p/ quem não tem o app. */
  export const APP_WEB_URL: string;
  /** OAuth Web client ID do Google (ver docs/mobile-social-login.md). */
  export const GOOGLE_WEB_CLIENT_ID: string;
}
