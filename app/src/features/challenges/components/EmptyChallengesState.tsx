import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '@theme';
import { Button } from '@shared/components/Button';

export function EmptyChallengesState({ onCreate }: { onCreate: () => void }): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🏆</Text>
      <Text style={styles.title}>Nenhum desafio ainda</Text>
      <Text style={styles.subtitle}>Crie um desafio e convide seus amigos para participar.</Text>
      <Button onPress={onCreate}>Criar desafio</Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64, paddingHorizontal: 32, gap: 8 },
  emoji: { fontSize: 44 },
  title: { fontSize: 17, color: colors.brandAnchor, fontFamily: typography.fontFamily.bold },
  subtitle: { fontSize: 14, color: colors.brandTextMuted, textAlign: 'center', marginBottom: 8 },
});
