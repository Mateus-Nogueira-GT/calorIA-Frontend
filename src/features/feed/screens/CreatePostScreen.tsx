import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography } from '@theme';
import { Button } from '@shared/components/Button';
import { useFeedStore } from '../store';
import type { AchievementType, PostAchievement } from '@shared/services/feed.service';
import type { CommunityStackScreenProps } from '@navigation/types';

type Props = CommunityStackScreenProps<'CreatePost'>;

const SUBMIT_LABEL = 'Publicar';

const ACHIEVEMENT_OPTIONS: PostAchievement[] = [
  {
    type: 'diet_completed' as AchievementType,
    emoji: '🍽️',
    title: 'Dieta concluída',
    subtitle: 'Completei todas as refeições de hoje',
  },
  {
    type: 'meal_logged' as AchievementType,
    emoji: '🥗',
    title: 'Refeição registrada',
    subtitle: 'Registrei minha refeição no diário',
  },
  {
    type: 'streak' as AchievementType,
    emoji: '🔥',
    title: 'Sequência ativa',
    subtitle: 'Mantive minha sequência de dias',
  },
];

export function CreatePostScreen({ navigation }: Props): React.JSX.Element {
  const [content, setContent] = useState('');
  const [selected, setSelected] = useState<PostAchievement | null>(null);
  const isCreating = useFeedStore((s) => s.isCreating);
  const createPost = useFeedStore((s) => s.createPost);

  const canSubmit = content.trim().length > 0 && !isCreating;

  const submit = async () => {
    try {
      await createPost(content.trim(), selected ?? undefined);
      navigation.goBack();
    } catch {
      /* Alert já disparado no store em falhas de rede futuras; createPost relança */
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <TextInput
          style={styles.input}
          placeholder="Compartilhe sua conquista..."
          placeholderTextColor={colors.brandTextMuted}
          value={content}
          onChangeText={setContent}
          multiline
          autoFocus
        />

        <Text style={styles.label}>Anexar conquista (opcional)</Text>
        {ACHIEVEMENT_OPTIONS.map((opt) => {
          const active = selected?.type === opt.type;
          return (
            <Pressable
              key={opt.type}
              onPress={() => setSelected(active ? null : opt)}
              style={[styles.option, active && styles.optionActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={styles.optionEmoji}>{opt.emoji}</Text>
              <View style={styles.optionTexts}>
                <Text style={styles.optionTitle}>{opt.title}</Text>
                <Text style={styles.optionSubtitle}>{opt.subtitle}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <Button onPress={submit} disabled={!canSubmit} loading={isCreating}>
          {SUBMIT_LABEL}
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.brandBackground },
  content: { padding: 20, gap: 16 },
  input: {
    minHeight: 120,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    padding: 14,
    fontSize: 16,
    color: colors.brandText,
    textAlignVertical: 'top',
  },
  label: { fontSize: 13, color: colors.brandTextMuted, fontFamily: typography.fontFamily.medium },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.brandDivider,
    padding: 12,
  },
  optionActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandSupportSoft },
  optionEmoji: { fontSize: 24 },
  optionTexts: { flex: 1 },
  optionTitle: {
    fontSize: 15,
    color: colors.brandAnchor,
    fontFamily: typography.fontFamily.semiBold,
  },
  optionSubtitle: { fontSize: 13, color: colors.brandTextMuted, marginTop: 2 },
  footer: { padding: 20, borderTopWidth: 1, borderTopColor: colors.brandDivider },
});
