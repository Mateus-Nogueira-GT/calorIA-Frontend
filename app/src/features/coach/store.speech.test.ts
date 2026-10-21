import { useCoachStore } from './store';
import { useAuthStore } from '@features/auth/store';
import { coachService } from '@shared/services/coach.service';
import { playSpeech, saveSpeech, stopSpeech } from '@shared/services/voice-player.service';

jest.mock('@shared/services/coach.service', () => ({
  coachService: { getHistory: jest.fn(), sendMessage: jest.fn(), speak: jest.fn() },
}));
jest.mock('@shared/services/voice-player.service', () => ({
  isSpeechSupported: true,
  saveSpeech: jest.fn(),
  playSpeech: jest.fn(),
  stopSpeech: jest.fn(),
}));
jest.mock('@features/diet/store', () => ({
  useDietStore: { getState: () => ({ loadCurrent: jest.fn(), clear: jest.fn() }) },
}));
jest.mock('@shared/services/diet.service', () => ({
  dietService: { stepJob: jest.fn(), getJob: jest.fn(), retryJob: jest.fn() },
}));

const send = coachService.sendMessage as jest.Mock;
const speak = coachService.speak as jest.Mock;
const save = saveSpeech as jest.Mock;
const play = playSpeech as jest.Mock;

const reply = {
  conversationId: 'conv-1',
  acknowledge: jest.fn().mockResolvedValue(undefined),
  message: {
    id: 'conv-1-9',
    role: 'coach',
    content: 'Beba água.',
    timestamp: '2026-10-21T00:00:00Z',
  },
};
const voice = () => ({ signal: new AbortController().signal, isValid: () => true });
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const flush = () => new Promise((r) => setTimeout(r, 0));
const replyMessage = () => useCoachStore.getState().messages.find((m) => m.id === 'conv-1-9');

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.getState().clearToken();
  useAuthStore.getState().setToken('t-A', { id: 'user-A', name: 'A', email: 'a@x.test' });
  useCoachStore.getState().clear();
  send.mockResolvedValue(reply);
  speak.mockResolvedValue({ audio: 'UklG', mimeType: 'audio/wav' });
  save.mockResolvedValue('file:///cache/reply.mp3');
  play.mockResolvedValue(undefined);
});

describe('resposta do Coach em áudio', () => {
  it('mensagem de voz: busca o áudio da conversa, salva e toca sozinha', async () => {
    await useCoachStore.getState().sendMessage('quantas calorias tem um ovo', voice());
    await flush();
    expect(speak).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({ caloriaOwner: expect.objectContaining({ userId: 'user-A' }) }),
    );
    expect(save).toHaveBeenCalledWith('UklG', 'audio/wav');
    expect(replyMessage()?.audioUri).toBe('file:///cache/reply.mp3');
    expect(play).toHaveBeenCalledWith('file:///cache/reply.mp3', expect.any(Function));
    expect(useCoachStore.getState().speakingMessageId).toBe('conv-1-9');
  });

  it('mensagem digitada não gera áudio', async () => {
    await useCoachStore.getState().sendMessage('oi');
    await flush();
    expect(speak).not.toHaveBeenCalled();
    expect(replyMessage()?.audioUri).toBeUndefined();
  });

  it('logout antes do áudio chegar: nada é aplicado nem tocado', async () => {
    const audio = deferred<{ audio: string; mimeType: string }>();
    speak.mockReturnValueOnce(audio.promise);
    await useCoachStore.getState().sendMessage('pergunta privada', voice());
    useAuthStore.getState().clearToken();
    useAuthStore.getState().setToken('t-B', { id: 'user-B', name: 'B', email: 'b@x.test' });
    audio.resolve({ audio: 'SUQz', mimeType: 'audio/mpeg' });
    await flush();
    expect(save).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
    expect(useCoachStore.getState().messages).toEqual([]);
  });

  it('falha na síntese não vira erro: a resposta fica só em texto', async () => {
    speak.mockRejectedValueOnce({ response: { status: 502, data: { error: 'SPEECH_FAILED' } } });
    await useCoachStore.getState().sendMessage('pergunta', voice());
    await flush();
    expect(replyMessage()?.content).toBe('Beba água.');
    expect(replyMessage()?.audioUri).toBeUndefined();
    expect(useCoachStore.getState().error).toBeNull();
    expect(play).not.toHaveBeenCalled();
  });

  it('parar a fala antes do áudio chegar: o botão aparece, mas não toca sozinho', async () => {
    const audio = deferred<{ audio: string; mimeType: string }>();
    speak.mockReturnValueOnce(audio.promise);
    await useCoachStore.getState().sendMessage('pergunta', voice());
    useCoachStore.getState().stopSpeaking();
    audio.resolve({ audio: 'SUQz', mimeType: 'audio/mpeg' });
    await flush();
    expect(replyMessage()?.audioUri).toBe('file:///cache/reply.mp3');
    expect(play).not.toHaveBeenCalled();
  });

  it('toggleSpeech alterna tocar e parar; fim da reprodução limpa o estado', async () => {
    await useCoachStore.getState().sendMessage('pergunta', voice());
    await flush();
    useCoachStore.getState().toggleSpeech('conv-1-9');
    expect(stopSpeech).toHaveBeenCalled();
    expect(useCoachStore.getState().speakingMessageId).toBeNull();
    useCoachStore.getState().toggleSpeech('conv-1-9');
    expect(play).toHaveBeenCalledTimes(2);
    expect(useCoachStore.getState().speakingMessageId).toBe('conv-1-9');
    const onEnd = play.mock.calls[1][1] as () => void;
    onEnd();
    expect(useCoachStore.getState().speakingMessageId).toBeNull();
  });

  it('clear (logout) para a reprodução', async () => {
    await useCoachStore.getState().sendMessage('pergunta', voice());
    await flush();
    (stopSpeech as jest.Mock).mockClear();
    useCoachStore.getState().clear();
    expect(stopSpeech).toHaveBeenCalled();
    expect(useCoachStore.getState().speakingMessageId).toBeNull();
  });
});
