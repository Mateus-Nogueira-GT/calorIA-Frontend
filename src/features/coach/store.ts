import { create } from 'zustand';
import { coachService, CoachMessage } from '@shared/services/coach.service';

interface StoreMessage {
  id: string;
  role: 'coach' | 'user';
  content: string;
  timestamp: Date;
}

interface CoachState {
  messages: StoreMessage[];
  isLoading: boolean;
  loadHistory: () => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
}

function toStoreMessage(m: CoachMessage): StoreMessage {
  return { ...m, timestamp: new Date(m.timestamp) };
}

export const useCoachStore = create<CoachState>((set, get) => ({
  messages: [],
  isLoading: false,

  loadHistory: async () => {
    const history = await coachService.getHistory();
    set({ messages: history.map(toStoreMessage) });
  },

  sendMessage: async (content: string) => {
    const userMsg: StoreMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
    };
    set({ messages: [...get().messages, userMsg], isLoading: true });
    try {
      const response = await coachService.sendMessage(content);
      set((s) => ({
        messages: [...s.messages, toStoreMessage(response)],
        isLoading: false,
      }));
    } catch {
      set({ isLoading: false });
    }
  },
}));
