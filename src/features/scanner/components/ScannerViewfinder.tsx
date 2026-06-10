import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Text } from '@shared/components';
import { colors, typography } from '@theme';

interface Props { onPickImage: (uri: string) => void; isAnalyzing: boolean }

export function ScannerViewfinder({ onPickImage, isAnalyzing }: Props): React.JSX.Element {
  function handlePress() {
    if (Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) onPickImage(URL.createObjectURL(file));
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
        <Text style={styles.hint}>{isAnalyzing ? 'Analisando...' : 'Toque para escolher uma foto'}</Text>
      </View>
    </TouchableOpacity>
  );
}

const C = 20;
const B = 3;

const styles = StyleSheet.create({
  container: { backgroundColor: '#1A1A2E', borderRadius: 16, height: 220, alignItems: 'center', justifyContent: 'center' },
  frame: { width: 160, height: 160, alignItems: 'center', justifyContent: 'center' },
  hint: { color: 'rgba(255,255,255,0.7)', fontSize: typography.fontSize.xs, textAlign: 'center' },
  corner: { position: 'absolute', width: C, height: C, borderColor: colors.primary },
  tl: { top: 0, left: 0, borderTopWidth: B, borderLeftWidth: B, borderTopLeftRadius: 4 },
  tr: { top: 0, right: 0, borderTopWidth: B, borderRightWidth: B, borderTopRightRadius: 4 },
  bl: { bottom: 0, left: 0, borderBottomWidth: B, borderLeftWidth: B, borderBottomLeftRadius: 4 },
  br: { bottom: 0, right: 0, borderBottomWidth: B, borderRightWidth: B, borderBottomRightRadius: 4 },
});
