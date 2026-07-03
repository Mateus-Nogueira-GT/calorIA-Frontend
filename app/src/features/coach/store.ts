import { create } from 'zustand';
import { coachService, CoachMessage } from '@shared/services/coach.service';
import { dietService } from '@shared/services/diet.service';
import { useDietStore } from '@features/diet/store';

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
  loadHistory: () => Promise<void>;
  sendMessage: (content: string) => Promise<boolean>;
  retryLastAction: () => Promise<void>;
  runDietGeneration: (jobId: string) => Promise<void>;
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

export const useCoachStore = create<CoachState>((set, get) => ({
  conversationId: null,
  messages: [],
  isLoading: false,
  error: null,
  hasLoadedHistory: false,
  lastFailedAction: null,
  dietJob: null,

  loadHistory: async () => {
    const { conversationId } = get();
    if (!conversationId) {
      set({ hasLoadedHistory: true, error: null });
      return;
    }
    set({ error: null, hasLoadedHistory: false });
    try {
      const history = await coachService.getHistory(conversationId);
      set({ messages: history.messages.map(toStoreMessage), hasLoadedHistory: true, lastFailedAction: null });
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
      const { conversationId, message } = await coachService.sendMessage(trimmed, get().conversationId);
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
    } catch {
      set({
        isLoading: false,
        error: 'Nao foi possivel enviar sua mensagem. Tente novamente.',
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
      const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
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
      } catch {
        set({
          isLoading: false,
          error: 'Nao foi possivel enviar sua mensagem. Tente novamente.',
          lastFailedAction: 'send',
        });
      }
    }
  },

  // Polling da geração assíncrona: cada /step gera um dia; repetimos até
  // completar. A UI pode ler `dietJob` para mostrar o progresso.
  runDietGeneration: async (jobId: string) => {
    if (get().dietJob?.status === 'running') return;
    set({ dietJob: { status: 'running', daysCompleted: 0, totalDays: 5 } });
    try {
      // Guard: no máximo alguns passos a mais que o total de dias.
      for (let i = 0; i < 12; i++) {
        const s = await dietService.stepJob(jobId);
        set({
          dietJob: { status: s.status, daysCompleted: s.daysCompleted, totalDays: s.totalDays },
        });
        if (s.status === 'completed') {
          await useDietStore.getState().loadCurrent();
          break;
        }
        if (s.status === 'failed') break;
      }
    } catch {
      set((st) => ({
        dietJob: {
          status: 'failed',
          daysCompleted: st.dietJob?.daysCompleted ?? 0,
          totalDays: st.dietJob?.totalDays ?? 5,
        },
      }));
    }
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
    }),
}));
