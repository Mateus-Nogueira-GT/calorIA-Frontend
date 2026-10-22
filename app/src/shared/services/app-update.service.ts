import * as Updates from 'expo-updates';

/**
 * Aplica um OTA já na abertura em que ele é encontrado. Sem isto, a atualização
 * baixada só entrava na abertura SEGUINTE (EXPO_UPDATES_LAUNCH_WAIT_MS = 0 no
 * nativo, que não dá para mudar sem build de loja).
 *
 * Só recarrega dentro de uma janela curta logo após abrir (ou ao voltar de um
 * background longo): fora dela, o usuário já está usando o app e a atualização
 * baixada fica para a próxima abertura, como antes.
 */
export const LAUNCH_WINDOW_MS = 6000;
/** Voltar ao app depois de tanto tempo em background conta como "abrir de novo". */
export const LONG_BACKGROUND_MS = 30 * 60 * 1000;

let inFlight: Promise<boolean> | null = null;

/** Procura, baixa e — se ainda dentro da janela — recarrega. Devolve true se recarregou. */
export function applyPendingUpdate(windowMs: number = LAUNCH_WINDOW_MS): Promise<boolean> {
  if (!Updates.isEnabled || (typeof __DEV__ !== 'undefined' && __DEV__))
    return Promise.resolve(false);
  if (inFlight) return inFlight;
  const deadline = Date.now() + windowMs;
  inFlight = (async () => {
    try {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable || Date.now() > deadline) return false;
      const fetched = await Updates.fetchUpdateAsync();
      if (!fetched.isNew || Date.now() > deadline) return false;
      await Updates.reloadAsync();
      return true;
    } catch {
      // Rede/servidor: segue com a versão atual; o nativo tenta de novo na próxima abertura.
      return false;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
