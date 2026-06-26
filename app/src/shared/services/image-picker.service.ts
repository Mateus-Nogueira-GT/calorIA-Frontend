import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import type { ImageLibraryOptions } from 'react-native-image-picker';

const OPTIONS: ImageLibraryOptions = {
  mediaType: 'photo',
  includeBase64: true,
  maxWidth: 1024,
  maxHeight: 1024,
  quality: 0.8,
};

export async function pickImage(source: 'camera' | 'gallery'): Promise<string | null> {
  const res =
    source === 'camera' ? await launchCamera(OPTIONS) : await launchImageLibrary(OPTIONS);
  if (res.didCancel) return null;
  const asset = res.assets?.[0];
  if (!asset?.base64) return null;
  const mime = asset.type ?? 'image/jpeg';
  return `data:${mime};base64,${asset.base64}`;
}
