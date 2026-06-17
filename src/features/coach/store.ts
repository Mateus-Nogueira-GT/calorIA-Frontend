import { create } from 'zustand';
import { coachService, CoachMessage } from '@shared/services/coach.service';

interface StoreMessage {
  id: string;
  role: 'coach' | 'user';
  content: string;
  timestamp: Date;
  canGenerateDiet?: boolean;
}

interface CoachState {
  messages: StoreMessage[];
  isLoading: boolean;
  error: string | null;
  hasLoadedHistory: boolean;
  lastFailedAction: 'history' | 'send' | null;
  loadHistory: () => Promise<void>;
  sendMessage: (content: string) => Promise<boolean>;
  retryLastAction: () => Promise<void>;
}

function toStoreMessage(m: CoachMessage): StoreMessage {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: new Date(m.timestamp),
    ...(m.canGenerateDiet ? { canGenerateDiet: true } : {}),
  };
}

export const useCoachStore = create<CoachState>((set, get) => ({
  messages: [],
  isLoading: false,
  error: null,
  hasLoadedHistory: false,
  lastFailedAction: null,

  loadHistory: async () => {
    set({ error: null, hasLoadedHistory: false });
    try {
      const history = await coachService.getHistory();
      set({ messages: history.map(toStoreMessage), hasLoadedHistory: true, lastFailedAction: null });
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
    set({
      messages: [...get().messages, userMsg],
      isLoading: true,
      error: null,
    });
    try {
      const response = await coachService.sendMessage(trimmed);
      set((s) => ({
        messages: [...s.messages, toStoreMessage(response)],
        isLoading: false,
        error: null,
        lastFailedAction: null,
      }));
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
    const { lastFailedAction, messages } = get();

    if (lastFailedAction === 'history') {
      await get().loadHistory();
      return;
    }

    if (lastFailedAction === 'send') {
      const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
      if (!lastUserMessage) return;

      set({ isLoading: true, error: null });
      try {
        const response = await coachService.sendMessage(lastUserMessage.content);
        set((state) => ({
          messages: [...state.messages, toStoreMessage(response)],
          isLoading: false,
          error: null,
          lastFailedAction: null,
        }));
      } catch {
        set({
          isLoading: false,
          error: 'Nao foi possivel enviar sua mensagem. Tente novamente.',
          lastFailedAction: 'send',
        });
      }
    }
  },
}));
