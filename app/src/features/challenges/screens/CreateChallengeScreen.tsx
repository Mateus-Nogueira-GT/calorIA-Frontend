import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { screenShellStyle } from '@shared/components';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '@theme';
import { Input } from '@shared/components/Input';
import { Button } from '@shared/components/Button';
import { useChallengesStore } from '../store';
import { todayString, dateToString } from '@shared/utils/date';
import type { CommunityStackScreenProps } from '@navigation/types';

type Props = CommunityStackScreenProps<'CreateChallenge'>;

function plusDays(base: string, days: number): string {
  const d = new Date(base + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return dateToString(d);
}

export function CreateChallengeScreen({ navigation }: Props): React.JSX.Element {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const isCreating = useChallengesStore((s) => s.isCreating);
  const create = useChallengesStore((s) => s.create);

  const canSubmit = title.trim().length > 0 && !isCreating;

  const submit = async () => {
    const start = todayString();
    try {
      const created = await create({
        title: title.trim(),
        description: description.trim(),
        startDate: start,
        endDate: plusDays(start, 7),
      });
      navigation.replace('ChallengeLeaderboard', { challengeId: created.id });
    } catch {
      /* store já alerta em erro de rede */
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Input label='Título do desafio' value={title} onChangeText={setTitle} placeholder='Ex: 7 dias registrando tudo' />
        <Input label='Descrição' value={description} onChangeText={setDescription} placeholder='Conte a regra do desafio' multiline />
      </ScrollView>
      <View style={styles.footer}>
        <Button onPress={submit} disabled={!canSubmit} loading={isCreating}>Criar e convidar</Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brandBackground },
  content: { ...screenShellStyle, padding: spacing.xl, gap: spacing.lg },
  footer: { padding: spacing.xl, borderTopWidth: 1, borderTopColor: colors.brandDivider },
});
