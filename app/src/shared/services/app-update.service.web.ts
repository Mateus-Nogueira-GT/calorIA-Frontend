// Web: sem OTA do expo-updates (o site é publicado pela Vercel). Mesma assinatura,
// e sem importar o módulo nativo — o webpack do web não o empacota.
export const LAUNCH_WINDOW_MS = 6000;
export const LONG_BACKGROUND_MS = 30 * 60 * 1000;

export function applyPendingUpdate(_windowMs: number = LAUNCH_WINDOW_MS): Promise<boolean> {
  return Promise.resolve(false);
}
