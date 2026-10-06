import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { AxiosError, AxiosHeaders } from 'axios';
import { useVoiceMessage, MAX_RECORDING_SECONDS, MIN_RECORDING_MS } from './useVoiceMessage';

const mockStop = jest.fn<() => Promise<string>>();
const mockCancel = jest.fn<() => Promise<void>>();
const mockStart = jest.fn<() => Promise<{ stop: typeof mockStop; cancel: typeof mockCancel }>>();
const mockPermission = jest.fn<() => Promise<boolean>>();
const mockTranscribe = jest.fn<(audio: string, mime: string) => Promise<string>>();

jest.mock('@shared/services/voice-recorder.service', () => ({
  isVoiceSupported: true,
  VOICE_MIME_TYPE: 'audio/m4a',
  requestMicrophonePermission: () => mockPermission(),
  startVoiceRecording: () => mockStart(),
}));

jest.mock('@shared/services/coach.service', () => ({
  coachService: { transcribe: (a: string, m: string) => mockTranscribe(a, m) },
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

    expect(mockTranscribe).toHaveBeenCalledWith('QUFBQQ==', 'audio/m4a');
    expect(onSend).toHaveBeenCalledWith('quanto de proteína hoje?');
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
    expect(onSend).toHaveBeenCalledWith('oi');
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
    expect(onSend).toHaveBeenCalledWith('quanto de proteína hoje?');
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
    const [title, message] = alertSpy.mock.calls[0];
    expect(`${title} ${message ?? ''}`).toMatch(/um pouco mais/i);
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
});
