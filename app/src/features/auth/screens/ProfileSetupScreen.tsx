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
import { Text, screenShellStyle } from '@shared/components';
import { OnboardingChatBubble } from '../components/OnboardingChatBubble';
import { OnboardingOptionCard } from '../components/OnboardingOptionCard';
import { OnboardingProgressBar } from '../components/OnboardingProgressBar';
import { colors, typography, spacing } from '@theme';
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

/**
 * R1: o onboarding usa UM TextInput genérico para todos os passos de texto
 * livre, sem máscara. `Number("1,80")` é NaN, e `JSON.stringify` manda NaN como
 * `null` — que o backend rejeita (`z.number().optional()` aceita `undefined`,
 * não `null`). O usuário tomava "Não foi possível salvar seu perfil", repetia a
 * mesma resposta e ficava preso no onboarding para sempre.
 *
 * Aceitar a vírgula é deliberado: "1,80" é como se escreve em português.
 * Recusar seria culpar o usuário por acertar.
 */
function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(',', '.').replace(/[^\d.]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const MIN_HEIGHT_CM = 100;
const MAX_HEIGHT_CM = 250;
const MIN_WEIGHT_KG = 30;
const MAX_WEIGHT_KG = 300;

type StepCheck = { ok: true; value: string } | { ok: false; reason: string };

export function validateStep(step: Step, raw: string): StepCheck {
  const value = raw.trim();

  if (step === 'name') {
    if (value.length < 2) {
      return { ok: false, reason: 'Preciso de pelo menos duas letras. Como posso te chamar?' };
    }
    return { ok: true, value: value.slice(0, 100) };
  }

  if (step === 'height') {
    const n = parseNumber(value);
    if (n === null) {
      return {
        ok: false,
        reason: 'Não entendi a altura. Me manda só o número, em centímetros — por exemplo: 180.',
      };
    }
    // Aceita metros (1,80) e centímetros (180) no mesmo campo.
    const cm = Math.round(n < 3 ? n * 100 : n);
    if (cm < MIN_HEIGHT_CM || cm > MAX_HEIGHT_CM) {
      return {
        ok: false,
        reason: `Essa altura não parece certa. Me manda entre ${MIN_HEIGHT_CM} e ${MAX_HEIGHT_CM} cm — por exemplo: 180.`,
      };
    }
    return { ok: true, value: String(cm) };
  }

  if (step === 'weight') {
    const n = parseNumber(value);
    if (n === null) {
      return {
        ok: false,
        reason: 'Não entendi o peso. Me manda só o número, em quilos — por exemplo: 80,5.',
      };
    }
    const kg = Math.round(n * 10) / 10;
    if (kg < MIN_WEIGHT_KG || kg > MAX_WEIGHT_KG) {
      return {
        ok: false,
        reason: `Esse peso não parece certo. Me manda entre ${MIN_WEIGHT_KG} e ${MAX_WEIGHT_KG} kg — por exemplo: 80,5.`,
      };
    }
    return { ok: true, value: String(kg) };
  }

  return { ok: true, value };
}

/** Extrai a causa que o backend explicou; sem ela, distingue rede de resto. */
function describeSubmitError(error: unknown): string {
  const e = error as {
    response?: { data?: { message?: string } };
    code?: string;
    message?: string;
  };

  const fromServer = e?.response?.data?.message;
  if (typeof fromServer === 'string' && fromServer.trim()) return fromServer;

  const isNetwork =
    e?.code === 'ECONNABORTED' ||
    e?.code === 'ERR_NETWORK' ||
    (typeof e?.message === 'string' && /timeout|network/i.test(e.message));
  if (isNetwork) {
    return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  }

  return 'Não foi possível salvar seu perfil. Tente novamente.';
}

interface ChatMessage {
  id: string;
  role: 'coach' | 'user';
  text: string;
}

export function ProfileSetupScreen({ navigation }: AuthStackScreenProps<'ProfileSetup'>): React.JSX.Element {
  const setToken = useAuthStore((s) => s.setToken);
  const setProfilePreferences = useAuthStore((s) => s.setProfilePreferences);
  const setProfileComplete = useAuthStore((s) => s.setProfileComplete);
  const pendingAuth = useAuthStore((s) => s.pendingAuth);
  const user = useAuthStore((s) => s.user);

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: '0', role: 'coach', text: QUESTIONS.name },
  ]);
  const [inputText, setInputText] = useState('');
  const [answers, setAnswers] = useState<Partial<Record<Step, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  // Ids do FlatList precisam ser únicos: cada repergunta gera uma nova dupla.
  const [retryCount, setRetryCount] = useState(0);
  const listRef = useRef<FlatList>(null);

  const currentStep = STEPS[currentStepIndex];
  const hasOptions = !!OPTIONS[currentStep];

  function advanceWithAnswer(value: string) {
    const step = STEPS[currentStepIndex];

    // Valida ANTES de consumir o passo: inválido, o Coach repergunta e o
    // usuário continua onde estava. Validar só no envio faria ele refazer os 7.
    const check = validateStep(step, value);
    if (!check.ok) {
      setMessages([
        ...messages,
        { id: `user-${step}-${retryCount}`, role: 'user', text: value },
        { id: `coach-retry-${step}-${retryCount}`, role: 'coach', text: check.reason },
      ]);
      setRetryCount((n) => n + 1);
      setInputText('');
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      return;
    }

    const newAnswers = { ...answers, [step]: check.value };
    setAnswers(newAnswers);

    const nextMessages: ChatMessage[] = [
      ...messages,
      { id: `user-${step}`, role: 'user', text: check.value },
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
    // As opções somem via `!submitting`, mas isso depende do re-render — um
    // toque duplo real dispara duas chamadas.
    if (submitting) return;
    setSubmitting(true);
    try {
      const payload: ProfileSetupPayload = {
        name: finalAnswers.name ?? user?.name ?? '',
        bodyType: (finalAnswers.bodyType as ProfileSetupPayload['bodyType']) ?? 'unknown',
        heightCm: Number(finalAnswers.height ?? 0),
        weightKg: Number(finalAnswers.weight ?? 0),
        goal: finalAnswers.goal ?? '',
        coachPersonality: (finalAnswers.personality as ProfileSetupPayload['coachPersonality']) ?? 'motivational',
        coachGender: (finalAnswers.gender as ProfileSetupPayload['coachGender']) ?? 'neutral',
      };
      // O interceptor autentica esta chamada com pendingAuth.token.
      await authService.profileSetup(payload);
      setProfilePreferences({
        goal: (finalAnswers.goal as 'lose_weight' | 'gain_muscle' | 'maintain' | 'health') ?? null,
        coachPersonality: (finalAnswers.personality as 'motivational' | 'direct' | 'empathetic' | 'scientific') ?? null,
      });

      // Autentica só DEPOIS do perfil salvo: setToken troca a árvore de
      // navegação na hora, e o dashboard busca as metas ao montar. Antes,
      // ele montava com o request em voo (metas zeradas) e uma falha aqui
      // deixava a conta autenticada sem altura/peso/objetivo.
      if (pendingAuth) {
        setToken(pendingAuth.token, pendingAuth.user, pendingAuth.refreshToken);
      }

      // R6: esta tela também recebe quem JÁ tem sessão e só não terminou o
      // perfil (voltou pelo gate do RootNavigator). Nesse caso não há
      // pendingAuth e o setToken acima não roda — é esta linha que destrava a
      // troca de árvore.
      setProfileComplete(true);
    } catch (error) {
      // Segue no onboarding: tocar de novo na última opção reenvia.
      // A mensagem do backend era descartada — o usuário via "tente novamente"
      // sem saber o que corrigir, e repetia o mesmo erro.
      Alert.alert('Erro', describeSubmitError(error));
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
      // N3: no Android o manifest já usa windowSoftInputMode=adjustResize, que
      // encolhe a janela quando o teclado sobe. Com behavior='height' o
      // KeyboardAvoidingView encolhia DE NOVO por cima disso, e em tela pequena
      // o conteúdo saltava e o botão de avançar podia sumir. As outras quatro
      // telas do app já usavam `undefined` — esta era o ponto fora da curva.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
          // Reduz a entrada ruim na origem. NÃO substitui validateStep: o
          // teclado numérico do Android tem vírgula.
          keyboardType={currentStep === 'height' || currentStep === 'weight' ? 'numeric' : 'default'}
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
  chatContent: { ...screenShellStyle, padding: spacing.lg },
  options: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  inputRow: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: spacing.lg,
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
