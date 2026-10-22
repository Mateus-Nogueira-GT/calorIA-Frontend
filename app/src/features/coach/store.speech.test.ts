import { useCoachStore } from './store';
import { useAuthStore } from '@features/auth/store';
import { coachService } from '@shared/services/coach.service';
import {
  clearSpeechCache,
  deleteSpeech,
  playSpeech,
  saveSpeech,
  stopSpeech,
} from '@shared/services/voice-player.service';

jest.mock('@shared/services/coach.service', () => ({
  coachService: { getHistory: jest.fn(), sendMessage: jest.fn(), speak: jest.fn() },
}));
jest.mock('@shared/services/voice-player.service', () => ({
  isSpeechSupported: true,
  clearSpeechCache: jest.fn(),
  deleteSpeech: jest.fn(),
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
      'Beba água.',
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

  it('clear (logout) limpa os áudios e a reprodução', async () => {
    await useCoachStore.getState().sendMessage('pergunta', voice());
    await flush();
    (stopSpeech as jest.Mock).mockClear();
    useCoachStore.getState().clear();
    expect(clearSpeechCache).toHaveBeenCalled();
    expect(useCoachStore.getState().speakingMessageId).toBeNull();
  });
});

it('nova mensagem digitada invalida o áudio pendente da resposta anterior', async () => {
  const audio = deferred<{ audio: string; mimeType: string }>();
  speak.mockReturnValueOnce(audio.promise);
  await useCoachStore.getState().sendMessage('primeira pergunta', voice());
  send.mockResolvedValueOnce({
    ...reply,
    message: { ...reply.message, id: 'conv-1-10', content: 'Outra resposta.' },
  });
  await useCoachStore.getState().sendMessage('segunda pergunta');
  audio.resolve({ audio: 'SUQz', mimeType: 'audio/mpeg' });
  await flush();
  expect(save).not.toHaveBeenCalled();
  expect(play).not.toHaveBeenCalled();
});

it('clear enquanto salva remove o arquivo que chegou tarde', async () => {
  const saved = deferred<string>();
  save.mockReturnValueOnce(saved.promise);
  await useCoachStore.getState().sendMessage('pergunta', voice());
  await flush();
  useCoachStore.getState().clear();
  saved.resolve('file:///cache/late.wav');
  await flush();
  expect(deleteSpeech).toHaveBeenCalledWith('file:///cache/late.wav');
  expect(play).not.toHaveBeenCalled();
});

it('dois áudios em sequência: só a resposta mais recente é salva e reproduzida', async () => {
  const firstAudio = deferred<{ audio: string; mimeType: string }>();
  speak.mockReturnValueOnce(firstAudio.promise);
  await useCoachStore.getState().sendMessage('primeira', voice());
  send.mockResolvedValueOnce({
    ...reply,
    message: { ...reply.message, id: 'conv-1-10', content: 'Outra resposta.' },
  });
  await useCoachStore.getState().sendMessage('segunda', voice());
  await flush();
  firstAudio.resolve({ audio: 'old', mimeType: 'audio/wav' });
  await flush();
  expect(save).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledWith('UklG', 'audio/wav');
  expect(replyMessage()?.audioUri).toBeUndefined();
  expect(useCoachStore.getState().speakingMessageId).toBe('conv-1-10');
});
