import React, { useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { authService, ProfileSetupPayload } from '@shared/services/auth.service';
import { useAuthStore } from '@features/auth/store';
import { Text } from '@shared/components';
import { OnboardingChatBubble } from '../components/OnboardingChatBubble';
import { OnboardingOptionCard } from '../components/OnboardingOptionCard';
import { OnboardingProgressBar } from '../components/OnboardingProgressBar';
import { colors, typography } from '@theme';
import type { AuthStackScreenProps } from '@navigation/types';

type Step = 'name' | 'bodyType' | 'height' | 'weight' | 'goal' | 'personality' | 'gender';

const STEPS: Step[] = ['name', 'bodyType', 'height', 'weight', 'goal', 'personality', 'gender'];

const QUESTIONS: Record<Step, string> = {
  name: 'Como você gostaria de ser chamado?',
  bodyType: 'Qual é o seu biotipo?',
  height: 'Qual é a sua altura? (cm)',
  weight: 'Qual é o seu peso atual? (kg)',
  goal: 'Qual é o seu objetivo principal?',
  personality: 'Como você prefere que seu coach seja?',
  gender: 'Qual o gênero do seu mentor?',
};

type OptionDef = { value: string; emoji: string; title: string; description: string };

const OPTIONS: Partial<Record<Step, OptionDef[]>> = {
  bodyType: [
    { value: 'ectomorph', emoji: '🦴', title: 'Ectomorfo', description: 'Metabolismo rápido, difícil ganhar massa' },
    { value: 'mesomorph', emoji: '💪', title: 'Mesomorfo', description: 'Corpo atlético, ganha e perde peso com facilidade' },
    { value: 'endomorph', emoji: '🏋️', title: 'Endomorfo', description: 'Tende a acumular gordura, metabolismo mais lento' },
    { value: 'unknown', emoji: '❓', title: 'Não sei', description: 'Deixe a IA identificar pelo seu perfil' },
  ],
  goal: [
    { value: 'lose_weight', emoji: '📉', title: 'Perder peso', description: 'Reduzir gordura corporal com saúde' },
    { value: 'gain_muscle', emoji: '📈', title: 'Ganhar massa', description: 'Aumentar músculo e força' },
    { value: 'maintain', emoji: '⚖️', title: 'Manter peso', description: 'Estabilizar o peso atual' },
    { value: 'health', emoji: '🌱', title: 'Melhorar saúde', description: 'Alimentação equilibrada e bem-estar' },
  ],
  personality: [
    { value: 'motivational', emoji: '🔥', title: 'Motivador', description: 'Energia e incentivo constante' },
    { value: 'direct', emoji: '🎯', title: 'Direto', description: 'Respostas objetivas sem rodeios' },
    { value: 'empathetic', emoji: '🤝', title: 'Empático', description: 'Compreensivo e acolhedor' },
    { value: 'scientific', emoji: '🔬', title: 'Científico', description: 'Baseado em evidências e dados' },
  ],
  gender: [
    { value: 'male', emoji: '👨', title: 'Masculino', description: '' },
    { value: 'female', emoji: '👩', title: 'Feminino', description: '' },
    { value: 'neutral', emoji: '🧑', title: 'Neutro', description: 'Sem gênero definido' },
  ],
};

interface ChatMessage {
  id: string;
  role: 'coach' | 'user';
  text: string;
}

export function ProfileSetupScreen({ navigation }: AuthStackScreenProps<'ProfileSetup'>): React.JSX.Element {
  const setToken = useAuthStore((s) => s.setToken);
  const setProfilePreferences = useAuthStore((s) => s.setProfilePreferences);
  const pendingAuth = useAuthStore((s) => s.pendingAuth);
  const user = useAuthStore((s) => s.user);

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: '0', role: 'coach', text: QUESTIONS.name },
  ]);
  const [inputText, setInputText] = useState('');
  const [answers, setAnswers] = useState<Partial<Record<Step, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const listRef = useRef<FlatList>(null);

  const currentStep = STEPS[currentStepIndex];
  const hasOptions = !!OPTIONS[currentStep];

  function advanceWithAnswer(value: string) {
    const step = STEPS[currentStepIndex];
    const newAnswers = { ...answers, [step]: value };
    setAnswers(newAnswers);

    const nextMessages: ChatMessage[] = [
      ...messages,
      { id: `user-${step}`, role: 'user', text: value },
    ];

    if (currentStepIndex < STEPS.length - 1) {
      const nextStep = STEPS[currentStepIndex + 1];
      nextMessages.push({ id: `coach-${nextStep}`, role: 'coach', text: QUESTIONS[nextStep] });
      setMessages(nextMessages);
      setCurrentStepIndex((i) => i + 1);
      setInputText('');
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } else {
      setMessages(nextMessages);
      submitProfile(newAnswers);
    }
  }

  async function submitProfile(finalAnswers: Partial<Record<Step, string>>) {
    setSubmitting(true);
    try {
      // O JWT precisa estar no estado de auth ANTES da chamada, pois o
      // interceptor do axios só anexa Authorization a partir de `token`
      // (pendingAuth.token ainda não conta pra ele).
      if (pendingAuth) {
        setToken(pendingAuth.token, pendingAuth.user);
      }

      const payload: ProfileSetupPayload = {
        name: finalAnswers.name ?? user?.name ?? '',
        bodyType: (finalAnswers.bodyType as ProfileSetupPayload['bodyType']) ?? 'unknown',
        heightCm: Number(finalAnswers.height ?? 0),
        weightKg: Number(finalAnswers.weight ?? 0),
        goal: finalAnswers.goal ?? '',
        coachPersonality: (finalAnswers.personality as ProfileSetupPayload['coachPersonality']) ?? 'motivational',
        coachGender: (finalAnswers.gender as ProfileSetupPayload['coachGender']) ?? 'neutral',
      };
      await authService.profileSetup(payload);
      setProfilePreferences({
        goal: (finalAnswers.goal as 'lose_weight' | 'gain_muscle' | 'maintain' | 'health') ?? null,
        coachPersonality: (finalAnswers.personality as 'motivational' | 'direct' | 'empathetic' | 'scientific') ?? null,
      });
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar seu perfil. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSend() {
    if (!inputText.trim()) return;
    advanceWithAnswer(inputText.trim());
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <OnboardingProgressBar current={currentStepIndex + 1} total={STEPS.length} />

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.chatContent}
        renderItem={({ item }) => (
          <OnboardingChatBubble message={item.text} role={item.role} />
        )}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
      />

      {hasOptions && !submitting && (
        <View style={styles.options}>
          {OPTIONS[currentStep]!.map((opt) => (
            <OnboardingOptionCard
              key={opt.value}
              emoji={opt.emoji}
              title={opt.title}
              description={opt.description}
              selected={answers[currentStep] === opt.value}
              onPress={() => advanceWithAnswer(opt.value)}
            />
          ))}
        </View>
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Digite aqui..."
          placeholderTextColor={colors.textDisabled}
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          editable={!submitting}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!inputText.trim() || submitting) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim() || submitting}
          testID="send-btn"
        >
          <Text color={colors.white}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  chatContent: { padding: 16 },
  options: { paddingHorizontal: 16, paddingBottom: 8 },
  inputRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: colors.border },
});
