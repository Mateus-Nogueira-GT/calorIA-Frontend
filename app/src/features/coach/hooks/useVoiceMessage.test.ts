import { useAuthStore } from '@features/auth/store';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { Alert, AppState, AppStateStatus } from 'react-native';
import { AxiosError, AxiosHeaders } from 'axios';
import { useVoiceMessage, MAX_RECORDING_SECONDS, MIN_RECORDING_MS } from './useVoiceMessage';

const mockStop = jest.fn<() => Promise<string>>();
const mockCancel = jest.fn<() => Promise<void>>();
const mockStart =
  jest.fn<
    (isValid?: () => boolean) => Promise<{ stop: typeof mockStop; cancel: typeof mockCancel }>
  >();
const mockPermission = jest.fn<() => Promise<boolean>>();
const mockTranscribe =
  jest.fn<(audio: string, mime: string, signal?: AbortSignal) => Promise<string>>();

jest.mock('@shared/services/voice-recorder.service', () => ({
  isVoiceSupported: true,
  VOICE_MIME_TYPE: 'audio/m4a',
  requestMicrophonePermission: () => mockPermission(),
  startVoiceRecording: (isValid?: () => boolean) => mockStart(isValid),
}));

jest.mock('@shared/services/coach.service', () => ({
  coachService: {
    transcribe: (a: string, m: string, signal?: AbortSignal) => mockTranscribe(a, m, signal),
  },
}));

function httpError(status: number, error: string): AxiosError {
  const headers = new AxiosHeaders();
  return new AxiosError('fail', 'ERR', { headers } as never, null, {
    status,
    statusText: '',
    headers: {},
    config: { headers },
    data: { error },
  });
}

describe('useVoiceMessage', () => {
  let alertSpy: jest.SpiedFunction<typeof Alert.alert>;
  const onSend = jest.fn<(text: string) => Promise<boolean>>();

  beforeEach(() => {
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
    AppState.currentState = 'active';
    useAuthStore
      .getState()
      .setToken('test-token', { id: 'voice-test', name: 'Maria', email: 'test@test.com' });
    jest.clearAllMocks();
    jest.useFakeTimers();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockPermission.mockResolvedValue(true);
    mockStop.mockResolvedValue('QUFBQQ==');
    mockCancel.mockResolvedValue();
    mockStart.mockResolvedValue({ stop: mockStop, cancel: mockCancel });
    mockTranscribe.mockResolvedValue('quanto de proteína hoje?');
    onSend.mockResolvedValue(true);
  });

  afterEach(() => {
    alertSpy.mockRestore();
    jest.useRealTimers();
  });

  function setup(disabled = false) {
    return renderHook(() => useVoiceMessage({ onSend, disabled }));
  }

  /** Começa a gravar e "fala" por 1,5 s (acima do mínimo). */
  async function startAndSpeak(result: { current: ReturnType<typeof useVoiceMessage> }) {
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
  }

  it('começa parado e suportado', () => {
    const { result } = setup();
    expect(result.current.isSupported).toBe(true);
    expect(result.current.status).toBe('idle');
    expect(result.current.elapsedSeconds).toBe(0);
  });

  it('start com permissão → gravando, e o cronômetro anda', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe('recording');

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(result.current.elapsedSeconds).toBe(3);
  });

  it('stop → transcreve o base64 e chama onSend com o texto', async () => {
    const { result } = setup();
    await startAndSpeak(result);
    await act(async () => {
      await result.current.stop();
    });

    expect(mockTranscribe).toHaveBeenCalledWith('QUFBQQ==', 'audio/m4a', expect.anything());
    expect(onSend).toHaveBeenCalledWith(
      'quanto de proteína hoje?',
      expect.objectContaining({ signal: expect.anything(), isValid: expect.any(Function) }),
    );
    expect(result.current.status).toBe('idle');
  });

  it('fica em "transcribing" enquanto espera o backend', async () => {
    let resolveTranscribe: (t: string) => void = () => {};
    mockTranscribe.mockReturnValue(new Promise<string>((r) => (resolveTranscribe = r)));
    const { result } = setup();
    await startAndSpeak(result);
    let stopping: Promise<void> = Promise.resolve();
    await act(async () => {
      stopping = result.current.stop();
    });
    expect(result.current.status).toBe('transcribing');

    await act(async () => {
      resolveTranscribe('oi');
      await stopping;
    });
    expect(result.current.status).toBe('idle');
    expect(onSend).toHaveBeenCalledWith('oi', expect.anything());
  });

  it('cancel → descarta e nada é enviado', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.cancel();
    });
    expect(mockCancel).toHaveBeenCalled();
    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it(`aos ${MAX_RECORDING_SECONDS} s para e envia sozinho`, async () => {
    expect(MAX_RECORDING_SECONDS).toBe(60);
    const { result } = setup();
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      jest.advanceTimersByTime(60000);
    });
    // deixa as promises do stop/transcribe/onSend assentarem
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith(
      'quanto de proteína hoje?',
      expect.objectContaining({ signal: expect.anything(), isValid: expect.any(Function) }),
    );
  });

  it('permissão negada → alerta e não grava', async () => {
    mockPermission.mockResolvedValue(false);
    const { result } = setup();
    await act(async () => {
      await result.current.start();
    });
    expect(mockStart).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(alertSpy).toHaveBeenCalled();
    expect(String(alertSpy.mock.calls[0][1])).toMatch(/configura/i);
  });

  it('não grava quando desabilitado (coach respondendo)', async () => {
    const { result } = setup(true);
    await act(async () => {
      await result.current.start();
    });
    expect(mockPermission).not.toHaveBeenCalled();
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('falha ao iniciar o gravador → alerta e volta ao idle', async () => {
    mockStart.mockRejectedValue(new Error('boom'));
    const { result } = setup();
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe('idle');
    expect(alertSpy).toHaveBeenCalled();
  });

  async function stopWithError(err: unknown) {
    mockTranscribe.mockRejectedValue(err);
    const { result } = setup();
    await startAndSpeak(result);
    await act(async () => {
      await result.current.stop();
    });
    expect(onSend).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    return alertSpy.mock.calls[0];
  }

  it('503 → "Áudio indisponível no momento"', async () => {
    const [title] = await stopWithError(httpError(503, 'TRANSCRIBE_UNAVAILABLE'));
    expect(title).toBe('Áudio indisponível no momento');
  });

  it('422 → "Não entendi o áudio, tenta de novo"', async () => {
    const [title] = await stopWithError(httpError(422, 'EMPTY_TRANSCRIPTION'));
    expect(title).toBe('Não entendi o áudio, tenta de novo');
  });

  it('429 de cota → avisa o limite diário', async () => {
    const [title, message] = await stopWithError(httpError(429, 'AI_QUOTA_EXCEEDED'));
    expect(`${title} ${message ?? ''}`).toMatch(/limite/i);
  });

  it('erro genérico (rede/502) → alerta para tentar de novo', async () => {
    const [title, message] = await stopWithError(httpError(502, 'TRANSCRIBE_FAILED'));
    expect(`${title} ${message ?? ''}`).toMatch(/tente de novo/i);
  });

  it('422 INVALID_AUDIO (provedor recusou o áudio) → mesma mensagem do 422', async () => {
    const [title] = await stopWithError(httpError(422, 'INVALID_AUDIO'));
    expect(title).toBe('Não entendi o áudio, tenta de novo');
  });

  it(`gravação com menos de ${MIN_RECORDING_MS} ms → descarta sem enviar e pede para gravar mais`, async () => {
    expect(MIN_RECORDING_MS).toBe(1000);
    const { result } = setup();
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    await act(async () => {
      await result.current.stop();
    });
    expect(mockCancel).toHaveBeenCalled();
    expect(mockStop).not.toHaveBeenCalled();
    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    const [, message] = alertSpy.mock.calls[0];
    expect(message).toBe('Fale um pouco mais antes de parar a gravação.');
  });

  it('falha local ao parar/ler a gravação → "Não foi possível gravar o áudio", sem rede', async () => {
    mockStop.mockRejectedValue(new Error('RECORDING_STOP_FAILED'));
    const { result } = setup();
    await startAndSpeak(result);
    await act(async () => {
      await result.current.stop();
    });
    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    const [title, message] = alertSpy.mock.calls[0];
    expect(`${title} ${message ?? ''}`).toBe('Não foi possível gravar o áudio Tente de novo.');
  });

  it('desmontar no meio da gravação descarta o áudio', async () => {
    const { result, unmount } = setup();
    await act(async () => {
      await result.current.start();
    });
    unmount();
    expect(mockCancel).toHaveBeenCalled();
  });
  it('não envia transcrição concluída depois de desmontar', async () => {
    let resolveTranscribe: (text: string) => void = () => {};
    mockTranscribe.mockReturnValue(
      new Promise<string>((r) => {
        resolveTranscribe = r;
      }),
    );
    const { result, unmount } = setup();
    await startAndSpeak(result);
    let stopping: Promise<void> = Promise.resolve();
    await act(async () => {
      stopping = result.current.stop();
    });
    unmount();
    await act(async () => {
      resolveTranscribe('conteúdo antigo');
      await stopping;
    });
    expect(onSend).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  function deferred<T>() {
    let resolve: (value: T) => void = () => {};
    let reject: (error: Error) => void = () => {};
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it.each(['logout', 'troca de conta', 'cancelar'])(
    '%s invalida uma transcrição e aborta seu transporte',
    async (action) => {
      const pending = deferred<string>();
      mockTranscribe.mockReturnValueOnce(pending.promise);
      const { result } = setup();
      await startAndSpeak(result);
      let stopping = Promise.resolve();
      await act(async () => {
        stopping = result.current.stop();
      });
      const signal = mockTranscribe.mock.calls[0][2];
      await act(async () => {
        if (action === 'logout') {
          useAuthStore.getState().clearToken();
          useAuthStore.getState().setToken('same-user-new-login', {
            id: 'voice-test',
            name: 'Maria',
            email: 'test@test.com',
          });
        } else if (action === 'troca de conta') {
          useAuthStore
            .getState()
            .setToken('new-user', { id: 'other', name: 'Outra', email: 'other@test.com' });
        } else await result.current.cancel();
      });
      expect(signal?.aborted).toBe(true);
      await act(async () => {
        pending.resolve('conteúdo anterior');
        await stopping;
      });
      expect(onSend).not.toHaveBeenCalled();
      expect(alertSpy).not.toHaveBeenCalled();
      expect(result.current.status).toBe('idle');
    },
  );

  it('refresh de token mantém a operação de voz válida', async () => {
    const pending = deferred<string>();
    mockTranscribe.mockReturnValueOnce(pending.promise);
    const { result } = setup();
    await startAndSpeak(result);
    let stopping = Promise.resolve();
    await act(async () => {
      stopping = result.current.stop();
    });
    await act(async () => {
      useAuthStore
        .getState()
        .setToken('renewed-token', { id: 'voice-test', name: 'Maria', email: 'test@test.com' });
      pending.resolve('voz atual');
      await stopping;
    });
    expect(onSend).toHaveBeenCalledWith('voz atual', expect.anything());
  });

  it('background cancela gravação e o envio automático', async () => {
    let change: (state: AppStateStatus) => void = () => {};
    const listener = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, callback) => {
        change = callback;
        return { remove: jest.fn() };
      });
    try {
      const { result } = setup();
      await startAndSpeak(result);
      await act(async () => {
        change('background');
      });
      await act(async () => {
        jest.advanceTimersByTime(61000);
      });
      expect(mockCancel).toHaveBeenCalledTimes(1);
      expect(mockTranscribe).not.toHaveBeenCalled();
      expect(onSend).not.toHaveBeenCalled();
    } finally {
      listener.mockRestore();
    }
  });

  it('navegar enquanto aguarda permissão impede preparar o gravador', async () => {
    const permission = deferred<boolean>();
    mockPermission.mockReturnValueOnce(permission.promise);
    const { result, unmount } = setup();
    let starting = Promise.resolve();
    await act(async () => {
      starting = result.current.start();
    });
    unmount();
    await act(async () => {
      permission.resolve(true);
      await starting;
    });
    expect(mockStart).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('cancelar durante preparação libera gravador tardio antes de aceitar nova tentativa', async () => {
    const prepared = deferred<{ stop: typeof mockStop; cancel: typeof mockCancel }>();
    mockStart.mockReturnValueOnce(prepared.promise);
    const { result } = setup();
    let starting = Promise.resolve();
    let cancelling = Promise.resolve();
    await act(async () => {
      starting = result.current.start();
    });
    await act(async () => {
      cancelling = result.current.cancel();
    });
    expect(result.current.status).toBe('cancelling');
    await act(async () => {
      await result.current.start();
    });
    expect(mockStart).toHaveBeenCalledTimes(1);
    await act(async () => {
      prepared.resolve({ stop: mockStop, cancel: mockCancel });
      await starting;
      await cancelling;
    });
    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('idle');
    await act(async () => {
      await result.current.start();
    });
    expect(mockStart).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('recording');
  });

  it('resposta antiga não altera nova gravação nem mostra erro', async () => {
    const old = deferred<string>();
    mockTranscribe.mockReturnValueOnce(old.promise);
    const { result } = setup();
    await startAndSpeak(result);
    let stopping = Promise.resolve();
    await act(async () => {
      stopping = result.current.stop();
    });
    await act(async () => {
      await result.current.cancel();
      await result.current.start();
    });
    await act(async () => {
      old.reject(new Error('late failure'));
      await stopping;
    });
    expect(result.current.status).toBe('recording');
    expect(alertSpy).not.toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
  });

  it('cancelamento enquanto lê arquivo não inicia transcrição', async () => {
    const audio = deferred<string>();
    mockStop.mockReturnValueOnce(audio.promise);
    const { result } = setup();
    await startAndSpeak(result);
    let stopping = Promise.resolve();
    let cancelling = Promise.resolve();
    await act(async () => {
      stopping = result.current.stop();
    });
    await act(async () => {
      cancelling = result.current.cancel();
    });
    await act(async () => {
      audio.resolve('base64');
      await stopping;
      await cancelling;
    });
    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('timer e toque em parar concorrentes enviam uma única mensagem', async () => {
    const { result } = setup();
    await startAndSpeak(result);
    await act(async () => {
      jest.advanceTimersByTime(60000);
      void result.current.stop();
    });
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(mockTranscribe).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('falha de limpeza bloqueia novos gravadores até reabrir o app', async () => {
    mockCancel.mockRejectedValueOnce(new Error('RECORDING_CLEANUP_FAILED'));
    const { result } = setup();
    await startAndSpeak(result);
    await act(async () => {
      await result.current.cancel();
    });
    expect(result.current.status).toBe('cleanupFailed');
    expect(alertSpy).toHaveBeenCalledWith(
      'Microfone indisponível',
      expect.stringMatching(/reabra/),
    );
    await act(async () => {
      await result.current.start();
    });
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it('inactive durante preparação invalida o guard nativo antes de gravar', async () => {
    let change: (state: AppStateStatus) => void = () => {};
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
      change = callback;
      return { remove: jest.fn() };
    });
    const prepared = deferred<{ stop: typeof mockStop; cancel: typeof mockCancel }>();
    mockStart.mockReturnValueOnce(prepared.promise);
    const { result } = setup();
    let starting = Promise.resolve();
    await act(async () => {
      starting = result.current.start();
    });
    const guard = mockStart.mock.calls[0][0];
    expect(guard?.()).toBe(true);
    await act(async () => {
      change('inactive');
    });
    expect(guard?.()).toBe(false);
    await act(async () => {
      prepared.resolve({ stop: mockStop, cancel: mockCancel });
      await starting;
    });
    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('diálogo de permissão inativo e retorno ativo permitem gravar', async () => {
    let change: (state: AppStateStatus) => void = () => {};
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
      change = callback;
      return { remove: jest.fn() };
    });
    const permission = deferred<boolean>();
    mockPermission.mockReturnValueOnce(permission.promise);
    const { result } = setup();
    let starting = Promise.resolve();
    await act(async () => {
      starting = result.current.start();
      change('inactive');
    });
    await act(async () => {
      change('active');
      permission.resolve(true);
      await starting;
    });
    expect(result.current.status).toBe('recording');
  });
});
