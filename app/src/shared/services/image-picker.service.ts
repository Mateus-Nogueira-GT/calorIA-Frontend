import { PermissionsAndroid, Platform } from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import type { ImageLibraryOptions } from 'react-native-image-picker';

const OPTIONS: ImageLibraryOptions = {
  mediaType: 'photo',
  includeBase64: true,
  maxWidth: 1024,
  maxHeight: 1024,
  quality: 0.8,
};

/**
 * Como o AndroidManifest declara android.permission.CAMERA, o
 * react-native-image-picker NÃO pede a permissão sozinho (regra documentada da
 * lib) — sem este request o launchCamera falhava em SILÊNCIO: tocar em "Tirar
 * foto" simplesmente não fazia nada. No iOS o sistema pede via Info.plist.
 */
async function ensureCameraPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
    title: 'Permissão de câmera',
    message: 'O CalorIA usa a câmera para você fotografar seus pratos.',
    buttonPositive: 'Permitir',
    buttonNegative: 'Agora não',
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export async function pickImage(source: 'camera' | 'gallery'): Promise<string | null> {
  if (source === 'camera' && !(await ensureCameraPermission())) {
    throw new Error('CAMERA_PERMISSION_DENIED');
  }

  const res =
    source === 'camera' ? await launchCamera(OPTIONS) : await launchImageLibrary(OPTIONS);

  if (res.didCancel) return null;
  // errorCode era ignorado: qualquer falha real (câmera indisponível, permissão
  // revogada nas configurações) virava `null` e o app tratava como cancelamento.
  // Agora estoura e o catch do CaptureScreen mostra o alerta certo.
  if (res.errorCode) throw new Error(res.errorCode);

  const asset = res.assets?.[0];
  if (!asset?.base64) return null;
  const mime = asset.type ?? 'image/jpeg';
  return `data:${mime};base64,${asset.base64}`;
}
