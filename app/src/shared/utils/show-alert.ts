import { Alert, Platform } from 'react-native';

/**
 * Alert.alert é NO-OP no react-native-web: no navegador, erros como "não foi
 * possível salvar a refeição" sumiam silenciosamente. No nativo continua o
 * alerta do sistema.
 *
 * Só para avisos (1 botão). Diálogos de CONFIRMAÇÃO seguem usando Alert.alert
 * direto — window.confirm mudaria o contrato de callbacks (ver
 * docs/mobile-hardening.md).
 */
export function showAlert(title: string, message?: string): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    // eslint-disable-next-line no-alert
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
