import axios from 'axios';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { coachService, CoachMessage } from '@shared/services/coach.service';
import { dietService, DietJobStatus } from '@shared/services/diet.service';
import { kvStorage } from '@shared/services/storage';
import { useDietStore } from '@features/diet/store';

// OP2: teto diário de tokens do backend (429 AI_QUOTA_EXCEEDED). Sem isso, o
// usuário via a mensagem genérica de erro de envio e não sabia que era um
// limite diário — parecia um bug para tentar de novo mais tarde no mesmo dia.
const QUOTA_MESSAGE = 'Você atingiu o limite diário do coach. Volte amanhã.';
const SEND_ERROR_MESSAGE = 'Não foi possível enviar sua mensagem. Tente novamente.';

function isQuotaExceeded(e: unknown): boolean {
  return (
    axios.isAxiosError(e) &&
    e.response?.status === 429 &&
    (e.response.data as { error?: string } | undefined)?.error === 'AI_QUOTA_EXCEEDED'
  );
}

// Geração da dieta (spec B): mensagens de fallback quando o servidor não manda
// errorMessage (backend antigo, rede). A do servidor tem preferência.
const DIET_QUOTA_MESSAGE = 'Limite diário de IA atingido. Tente novamente amanhã.';
const DIET_GENERIC_MESSAGE = 'Não foi possível gerar sua dieta agora. Tente novamente.';
// Janela de recuperação após erro transitório de step: 8 polls de 20 s
// (~160 s, o request antigo certamente já morreu no servidor).
const RECOVERY_POLLS = 8;
const RECOVERY_POLL_MS = 20000;
// Rodadas de recuperação seguidas sem avanço antes de desistir (~8 min).
// Antes eram até 30 (80 min–2,5 h) com o banner congelado em "dia N de 7".
const MAX_NO_PROGRESS_ROUNDS = 3;
const MAX_NETWORK_MISSES = 4;
const BUSY_WAIT_MS = 5000;
const MAX_STEPS = 30;

/**
 * Erro de /step que não adianta repetir → mensagem para o usuário; null quando
 * é transitório (rede, timeout do cliente, 5xx) e vale checar getJob/tentar de
 * novo. 429 de cota (inclusive backend antigo, sem corpo) para na hora; só o
 * rate limit genérico (TOO_MANY_REQUESTS) é tratado como transitório.
 */
function fatalStepError(e: unknown): string | null {
  if (!axios.isAxiosError(e) || !e.response) return null;
  const { status, data } = e.response;
  const body = data as { error?: string; message?: string } | undefined;
  if (status === 429) return body?.error === 'TOO_MANY_REQUESTS' ? null : DIET_QUOTA_MESSAGE;
  if (status >= 400 && status < 500 && status !== 408) {
    return body?.message || DIET_GENERIC_MESSAGE;
  }
  return null;
}

// Single-flight por jobId: retry/retomada com o loop do mesmo job ainda vivo
// reaproveitam a promise em vez de abrir um segundo loop (2 /step em voo =
// 2 gerações de IA pagas e progresso brigando no banner).
const dietLoops = new Map<string, Promise<void>>();

interface StoreMessage {
  id: string;
  role: 'coach' | 'user';
  content: string;
  timestamp: Date;
  dietGenerated?: boolean;
  dietId?: string | null;
  dietJobId?: string | null;
}

interface DietJobState {
  status: 'pending' | 'running' | 'completed' | 'failed';
  daysCompleted: number;
  totalDays: number;
  /** Rodada demorando (erro transitório, aguardando o servidor) → "Ainda trabalhando…". */
  slow: boolean;
  /** Motivo da falha para o usuário (pt-BR) quando status='failed'. */
  errorMessage: string | null;
}

interface CoachState {
  conversationId: string | null;
  messages: StoreMessage[];
  isLoading: boolean;
  error: string | null;
  hasLoadedHistory: boolean;
  lastFailedAction: 'history' | 'send' | null;
  dietJob: DietJobState | null;
  /** Job da geração corrente/última — necessário para o retry (B8). */
  activeJobId: string | null;
  loadHistory: () => Promise<void>;
  sendMessage: (content: string) => Promise<boolean>;
  retryLastAction: () => Promise<void>;
  runDietGeneration: (jobId: string) => Promise<void>;
  retryDietGeneration: (explicitJobId?: string) => Promise<void>;
  clear: () => void;
}

function toStoreMessage(m: CoachMessage): StoreMessage {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: new Date(m.timestamp),
    ...(m.dietGenerated ? { dietGenerated: true, dietId: m.dietId } : {}),
    ...(m.dietJobId ? { dietJobId: m.dietJobId } : {}),
  };
}

export const useCoachStore = create<CoachState>()(
  persist(
    (set, get) => ({
      conversationId: null,
      messages: [],
      isLoading: false,
      error: null,
      hasLoadedHistory: false,
      lastFailedAction: null,
      dietJob: null,
      activeJobId: null,

      loadHistory: async () => {
        const { conversationId } = get();
        if (!conversationId) {
          set({ hasLoadedHistory: true, error: null });
          return;
        }
        set({ error: null, hasLoadedHistory: false });
        try {
          const history = await coachService.getHistory(conversationId);
          set({
            messages: history.messages.map(toStoreMessage),
            hasLoadedHistory: true,
            lastFailedAction: null,
          });
        } catch {
          set({
            error: 'Não foi possível carregar sua conversa agora.',
            hasLoadedHistory: true,
            lastFailedAction: 'history',
          });
        }
      },

      sendMessage: async (content: string) => {
        const trimmed = content.trim();
        if (!trimmed) return false;

        const userMsg: StoreMessage = {
          id: `user-${Date.now()}`,
          role: 'user',
          content: trimmed,
          timestamp: new Date(),
        };
        set({ messages: [...get().messages, userMsg], isLoading: true, error: null });
        try {
          const { conversationId, message } = await coachService.sendMessage(
            trimmed,
            get().conversationId,
          );
          set((s) => ({
            conversationId,
            messages: [...s.messages, toStoreMessage(message)],
            isLoading: false,
            error: null,
            lastFailedAction: null,
          }));
          // Dieta é gerada de forma assíncrona (1 dia por chamada) — inicia o polling.
          if (message.dietJobId) void get().runDietGeneration(message.dietJobId);
          return true;
        } catch (e) {
          set({
            isLoading: false,
            error: isQuotaExceeded(e) ? QUOTA_MESSAGE : SEND_ERROR_MESSAGE,
            lastFailedAction: 'send',
          });
          return false;
        }
      },

      retryLastAction: async () => {
        const { lastFailedAction, messages, conversationId } = get();

        if (lastFailedAction === 'history') {
          await get().loadHistory();
          return;
        }

        if (lastFailedAction === 'send') {
          const lastUserMessage = [...messages]
            .reverse()
            .find((message) => message.role === 'user');
          if (!lastUserMessage) return;

          set({ isLoading: true, error: null });
          try {
            const { conversationId: nextConversationId, message } = await coachService.sendMessage(
              lastUserMessage.content,
              conversationId,
            );
            set((state) => ({
              conversationId: nextConversationId,
              messages: [...state.messages, toStoreMessage(message)],
              isLoading: false,
              error: null,
              lastFailedAction: null,
            }));
            if (message.dietJobId) void get().runDietGeneration(message.dietJobId);
          } catch (e) {
            set({
              isLoading: false,
              error: isQuotaExceeded(e) ? QUOTA_MESSAGE : SEND_ERROR_MESSAGE,
              lastFailedAction: 'send',
            });
          }
        }
      },

      // Polling da geração assíncrona: cada /step gera um dia; repetimos até
      // completar. A UI lê `dietJob` para mostrar o progresso (DietJobBanner).
      // B9 da spec: NUNCA dois /step em voo — depois de um erro de step, só
      // consultamos getJob até o dia avançar ou dar tempo do request antigo
      // morrer no servidor; evita pagar 2 gerações concorrentes de IA.
      runDietGeneration: (jobId: string) => {
        const inFlight = dietLoops.get(jobId);
        if (inFlight) return inFlight;
        const loop = driveDietJob(jobId).finally(() => dietLoops.delete(jobId));
        dietLoops.set(jobId, loop);
        return loop;
      },

      // B8: reabre um job failed no servidor e religa o polling, continuando
      // do dia em que parou (não regenera os dias já persistidos).
      retryDietGeneration: async (explicitJobId?: string) => {
        // O jobId pode vir de fora (M8: a seção da dieta descobre pelo
        // /diets/today/status que existe um job parado a retomar).
        const jobId = explicitJobId ?? get().activeJobId;
        if (!jobId) return;
        // Loop desse job ainda vivo → não reabre nem abre um segundo loop.
        const inFlight = dietLoops.get(jobId);
        if (inFlight) return inFlight;
        if (explicitJobId) set({ activeJobId: explicitJobId });
        try {
          await dietService.retryJob(jobId);
        } catch {
          return; // segue como failed; o botão permite tentar de novo
        }
        await get().runDietGeneration(jobId);
      },

      clear: () =>
        set({
          conversationId: null,
          messages: [],
          isLoading: false,
          error: null,
          hasLoadedHistory: false,
          lastFailedAction: null,
          dietJob: null,
          activeJobId: null,
        }),
    }),
    {
      name: 'caloria:coach',
      storage: createJSONStorage(() => kvStorage),
      // Só o id da conversa: as mensagens vêm do backend via loadHistory()
      // (persistir mensagens duplicaria a fonte de verdade).
      partialize: (state) => ({ conversationId: state.conversationId }),
    },
  ),
);

// --- Loop da geração de um job (o single-flight fica em runDietGeneration) ---
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const applyJobStatus = (s: DietJobStatus, slow = false) =>
  useCoachStore.setState({
    dietJob: {
      status: s.status,
      daysCompleted: s.daysCompleted,
      totalDays: s.totalDays,
      slow,
      errorMessage: s.status === 'failed' ? s.errorMessage || DIET_GENERIC_MESSAGE : null,
    },
  });
const failDietJob = (message: string) =>
  useCoachStore.setState((st) => ({
    dietJob: {
      status: 'failed',
      daysCompleted: st.dietJob?.daysCompleted ?? 0,
      totalDays: st.dietJob?.totalDays ?? 7,
      slow: false,
      errorMessage: message,
    },
  }));
const markDietJobSlow = () =>
  useCoachStore.setState((st) => (st.dietJob ? { dietJob: { ...st.dietJob, slow: true } } : {}));
const onDietJobCompleted = () => useDietStore.getState().loadCurrent();

async function driveDietJob(jobId: string): Promise<void> {
  const prev =
    useCoachStore.getState().activeJobId === jobId ? useCoachStore.getState().dietJob : null;
  useCoachStore.setState({
    activeJobId: jobId,
    dietJob: {
      status: 'running',
      // Retry do mesmo job: não pisca "dia 1" antes do primeiro step.
      daysCompleted: prev?.daysCompleted ?? 0,
      totalDays: prev?.totalDays ?? 7,
      slow: false,
      errorMessage: null,
    },
  });

  let networkMisses = 0;
  let noProgressRounds = 0;
  // 7 passos + folga pras janelas de recuperação.
  for (let i = 0; i < MAX_STEPS; i++) {
    const before = useCoachStore.getState().dietJob?.daysCompleted ?? 0;
    try {
      const s = await dietService.stepJob(jobId);
      networkMisses = 0;
      applyJobStatus(s);
      if (s.status === 'completed') return onDietJobCompleted();
      if (s.status === 'failed') return; // mensagem do servidor já aplicada
      // OP1: 200 sem avanço = outro step em voo no servidor. Espera antes
      // de pedir de novo, em vez de bater no rate limit.
      if (s.daysCompleted > before) noProgressRounds = 0;
      else await sleep(BUSY_WAIT_MS);
      continue;
    } catch (e) {
      // 4xx (cota, job inexistente, dados inválidos): repetir não resolve.
      const fatal = fatalStepError(e);
      if (fatal) return failDietJob(fatal);
    }

    // Erro transitório (rede/timeout/5xx): o servidor pode ainda estar
    // gerando, ou já ter marcado o job failed (timeout lá → 502). Poll de
    // status até o dia avançar ou ~160 s antes de um novo step.
    markDietJobSlow();
    let progressed = false;
    for (let poll = 0; poll < RECOVERY_POLLS; poll++) {
      await sleep(RECOVERY_POLL_MS);
      try {
        const g = await dietService.getJob(jobId);
        networkMisses = 0;
        if (g.status === 'completed') {
          applyJobStatus(g);
          return onDietJobCompleted();
        }
        if (g.status === 'failed') return applyJobStatus(g);
        if (g.daysCompleted > before) {
          applyJobStatus(g);
          progressed = true;
          break; // avançou → seguro voltar ao step
        }
        applyJobStatus(g, true);
      } catch {
        networkMisses++;
        if (networkMisses >= MAX_NETWORK_MISSES) return failDietJob(DIET_GENERIC_MESSAGE);
      }
    }
    if (progressed) noProgressRounds = 0;
    else if (++noProgressRounds >= MAX_NO_PROGRESS_ROUNDS) {
      return failDietJob(DIET_GENERIC_MESSAGE);
    }
  }

  // L4: o for pode esgotar as iterações sem completed nem failed
  // (servidor lento). Sem isto o banner ficava "Gerando sua dieta" para
  // sempre, com a barra congelada e sem botão de tentar de novo.
  if (useCoachStore.getState().dietJob?.status !== 'completed') failDietJob(DIET_GENERIC_MESSAGE);
}
