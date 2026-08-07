/// <reference lib="dom" />
import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Text } from '@shared/components';
import { colors, radius, typography } from '@theme';
import { showAlert } from '@shared/utils/show-alert';

interface Props { onPickImage: (dataUrl: string) => void; isAnalyzing: boolean }

const MAX_DIMENSION = 1024;
const JPEG_QUALITY = 0.8;

/**
 * Lê o arquivo escolhido, reduz para no máximo MAX_DIMENSION px no maior lado
 * e devolve um data URL JPEG base64 — formato que o backend repassa pra Vision
 * (um blob: URL local não é acessível pelo servidor).
 */
async function fileToDownscaledDataUrl(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = objectUrl;
    });

    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
    const width = Math.round(img.width * scale);
    const height = Math.round(img.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponível');
    ctx.drawImage(img, 0, 0, width, height);

    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function ScannerViewfinder({ onPickImage, isAnalyzing }: Props): React.JSX.Element {
  function handlePress() {
    if (Platform.OS !== 'web') {
      showAlert(
        'Scanner indisponivel',
        'O envio de foto ainda nao esta disponivel no app nativo.',
      );
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      fileToDownscaledDataUrl(file)
        .then(onPickImage)
        .catch(() => showAlert('Erro', 'Não foi possível ler a imagem escolhida.'));
    };
    input.click();
  }

  return (
    <TouchableOpacity style={styles.container} onPress={handlePress} disabled={isAnalyzing} activeOpacity={0.8} testID="scanner-viewfinder">
      <View style={styles.frame}>
        <View style={[styles.corner, styles.tl]} />
        <View style={[styles.corner, styles.tr]} />
        <View style={[styles.corner, styles.bl]} />
        <View style={[styles.corner, styles.br]} />
        <Text style={styles.hint}>
          {isAnalyzing
            ? 'Analisando...'
            : Platform.OS === 'web'
              ? 'Toque para escolher uma foto'
              : 'Disponivel na versao web'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const C = 20;
const B = 3;

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.brandAnchor,
    borderColor: colors.brandDivider,
    borderRadius: radius.lg,
    borderWidth: 1,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: { width: 160, height: 160, alignItems: 'center', justifyContent: 'center' },
  hint: { color: colors.brandSurface, fontSize: typography.fontSize.xs, textAlign: 'center' },
  corner: { position: 'absolute', width: C, height: C, borderColor: colors.brandPrimary },
  tl: { top: 0, left: 0, borderTopWidth: B, borderLeftWidth: B, borderTopLeftRadius: 4 },
  tr: { top: 0, right: 0, borderTopWidth: B, borderRightWidth: B, borderTopRightRadius: 4 },
  bl: { bottom: 0, left: 0, borderBottomWidth: B, borderLeftWidth: B, borderBottomLeftRadius: 4 },
  br: { bottom: 0, right: 0, borderBottomWidth: B, borderRightWidth: B, borderBottomRightRadius: 4 },
});
