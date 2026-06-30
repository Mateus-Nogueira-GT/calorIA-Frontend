import React from 'react';
import { Image, StyleSheet, View, Text } from 'react-native';
import { colors, typography } from '@theme';

type Size = 'sm' | 'md' | 'lg';

const SIZE_MAP: Record<Size, number> = { sm: 28, md: 36, lg: 48 };
const FONT_MAP: Record<Size, number> = { sm: typography.fontSize.base, md: 18, lg: typography.fontSize.xl };

interface Props {
  size?: Size;
  emoji?: string;
  /** URL/URI de uma foto. Tem prioridade sobre o emoji quando presente. */
  uri?: string | null;
  backgroundColor?: string;
}

export function Avatar({ size = 'md', emoji = '🤖', uri, backgroundColor }: Props): React.JSX.Element {
  const dim = SIZE_MAP[size];
  const shape = { width: dim, height: dim, borderRadius: dim / 2 };

  if (uri) {
    return (
      <Image
        source={{ uri }}
        accessibilityLabel="Foto de perfil"
        style={[styles.base, shape, { backgroundColor: colors.brandMutedSurface }]}
      />
    );
  }

  return (
    <View style={[styles.base, shape, { backgroundColor: backgroundColor ?? colors.primary }]}>
      <Text style={{ fontSize: FONT_MAP[size] }}>{emoji}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
});
