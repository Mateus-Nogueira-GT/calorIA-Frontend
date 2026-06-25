import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '@theme';
import { Button } from '@shared/components/Button';

interface Props {
  mode?: 'empty' | 'error';
  onCreate?: () => void;
  onRetry?: () => void;
}

export function EmptyFeedState({ mode = 'empty', onCreate, onRetry }: Props): React.JSX.Element {
  const isError = mode === 'error';
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>{isError ? '😕' : '🌱'}</Text>
      <Text style={styles.title}>{isError ? 'Não foi possível carregar o feed' : 'Ainda não há posts'}</Text>
      <Text style={styles.subtitle}>
        {isError ? 'Verifique sua conexão e tente novamente.' : 'Seja o primeiro a compartilhar uma conquista!'}
      </Text>
      {isError ? (
        <Button onPress={onRetry ?? (() => {})}>Tentar de novo</Button>
      ) : (
        <Button onPress={onCreate ?? (() => {})}>Criar post</Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64, paddingHorizontal: 32, gap: 8 },
  emoji: { fontSize: 44 },
  title: { fontSize: 17, color: colors.brandAnchor, fontFamily: typography.fontFamily.bold, textAlign: 'center' },
  subtitle: { fontSize: 14, color: colors.brandTextMuted, textAlign: 'center', marginBottom: 8 },
});
