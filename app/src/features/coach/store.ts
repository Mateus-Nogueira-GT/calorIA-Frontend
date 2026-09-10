import axios from 'axios';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { coachService, CoachMessage } from '@shared/services/coach.service';
import { dietService } from '@shared/services/diet.service';
import { kvStorage } from '@shared/services/storage';
import { useDietStore } from '@features/diet/store';

// OP2: teto diário de tokens do backend (429 AI_QUOTA_EXCEEDED). Sem isso, o
// usuário via a mensagem genérica de erro de envio e não sabia que era um
// limite diário — parecia um bug para tentar de novo mais tarde no mesmo dia.
const QUOTA_MESSAGE = 'Você atingiu o limite diário do coach. Volte amanhã.';
const SEND_ERROR_MESSAGE = 'Nao foi possivel enviar sua mensagem. Tente novamente.';

function isQuotaExceeded(e: unknown): boolean {
  return (
    axios.isAxiosError(e) &&
    e.response?.status === 429 &&
    (e.response.data as { error?: string } | undefined)?.error === 'AI_QUOTA_EXCEEDED'
  );
}

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
            error: 'Nao foi possivel carregar sua conversa agora.',
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
      runDietGeneration: async (jobId: string) => {
        if (get().dietJob?.status === 'running') return;
        set({ activeJobId: jobId, dietJob: { status: 'running', daysCompleted: 0, totalDays: 7 } });
        const apply = (s: {
          status: 'pending' | 'running' | 'completed' | 'failed';
          daysCompleted: number;
          totalDays: number;
        }) =>
          set({
            dietJob: { status: s.status, daysCompleted: s.daysCompleted, totalDays: s.totalDays },
          });
        const finish = async (status: 'completed' | 'failed') => {
          if (status === 'completed') await useDietStore.getState().loadCurrent();
        };
        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

        let networkMisses = 0;
        // 7 passos + folga pras janelas de recuperação.
        for (let i = 0; i < 30; i++) {
          const before = get().dietJob?.daysCompleted ?? 0;
          try {
            const s = await dietService.stepJob(jobId);
            networkMisses = 0;
            apply(s);
            if (s.status === 'completed') return finish('completed');
            if (s.status === 'failed') return;
            // OP1: 200 sem avanço = outro step em voo no servidor. Espera antes
            // de pedir de novo, em vez de bater no rate limit.
            if (s.daysCompleted === before) await sleep(5000);
          } catch {
            // O step falhou NO CLIENTE (timeout/rede), mas o servidor pode ainda
            // estar gerando (timeout lá: 120s). Poll de status até o dia avançar
            // ou ~160s (chamada antiga certamente encerrada) antes de novo step.
            for (let poll = 0; poll < 8; poll++) {
              await sleep(20000);
              try {
                const g = await dietService.getJob(jobId);
                networkMisses = 0;
                apply(g);
                if (g.status === 'completed') return finish('completed');
                if (g.status === 'failed') return;
                if (g.daysCompleted > before) break; // avançou → seguro voltar ao step
              } catch {
                networkMisses++;
                if (networkMisses >= 4) {
                  set((st) => ({
                    dietJob: {
                      status: 'failed',
                      daysCompleted: st.dietJob?.daysCompleted ?? 0,
                      totalDays: st.dietJob?.totalDays ?? 7,
                    },
                  }));
                  return;
                }
              }
            }
          }
        }

        // L4: o for pode esgotar as 30 iterações sem completed nem failed
        // (servidor lento). Sem isto o banner ficava "Gerando sua dieta" para
        // sempre, com a barra congelada e sem botão de tentar de novo.
        set((st) =>
          st.dietJob && st.dietJob.status !== 'completed'
            ? { dietJob: { ...st.dietJob, status: 'failed' } }
            : {},
        );
      },

      // B8: reabre um job failed no servidor e religa o polling, continuando
      // do dia em que parou (não regenera os dias já persistidos).
      retryDietGeneration: async (explicitJobId?: string) => {
        // O jobId pode vir de fora (M8: a seção da dieta descobre pelo
        // /diets/today/status que existe um job parado a retomar).
        const jobId = explicitJobId ?? get().activeJobId;
        if (!jobId) return;
        if (explicitJobId) set({ activeJobId: explicitJobId });
        try {
          await dietService.retryJob(jobId);
        } catch {
          return; // segue como failed; o botão permite tentar de novo
        }
        set({ dietJob: null });
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
