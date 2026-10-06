import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { AxiosError, AxiosHeaders } from 'axios';
import { ChatInput } from './ChatInput';

let mockSupported = true;
const mockStop = jest.fn();
const mockCancel = jest.fn();
const mockStart = jest.fn();
const mockPermission = jest.fn();
const mockTranscribe = jest.fn();

jest.mock('@shared/services/voice-recorder.service', () => ({
  get isVoiceSupported() {
    return mockSupported;
  },
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

describe('ChatInput', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupported = true;
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockPermission.mockResolvedValue(true);
    mockStop.mockResolvedValue('QUFBQQ==');
    mockCancel.mockResolvedValue(undefined);
    mockStart.mockResolvedValue({ stop: mockStop, cancel: mockCancel });
    mockTranscribe.mockResolvedValue('quanto de proteína hoje?');
  });

  afterEach(() => {
    alertSpy.mockRestore();
    jest.useRealTimers();
  });

  it('chama onSend com o texto ao pressionar enviar', async () => {
    const onSend = jest.fn().mockResolvedValue(true);
    const { getByPlaceholderText, getByTestId } = render(
      <ChatInput onSend={onSend} disabled={false} />,
    );
    fireEvent.changeText(getByPlaceholderText('Pergunte ao Coach...'), 'Olá');
    await act(async () => {
      fireEvent.press(getByTestId('chat-send-btn'));
    });
    expect(onSend).toHaveBeenCalledWith('Olá');
  });

  it('campo vazio → mostra o microfone no lugar do enviar', () => {
    const onSend = jest.fn().mockResolvedValue(true);
    const { getByTestId, queryByTestId } = render(<ChatInput onSend={onSend} disabled={false} />);
    expect(getByTestId('chat-mic-btn')).toBeTruthy();
    expect(queryByTestId('chat-send-btn')).toBeNull();
  });

  it('com texto → mostra o enviar e esconde o microfone', () => {
    const onSend = jest.fn().mockResolvedValue(true);
    const { getByTestId, queryByTestId, getByPlaceholderText } = render(
      <ChatInput onSend={onSend} disabled={false} />,
    );
    fireEvent.changeText(getByPlaceholderText('Pergunte ao Coach...'), 'Oi');
    expect(getByTestId('chat-send-btn')).toBeTruthy();
    expect(queryByTestId('chat-mic-btn')).toBeNull();
  });

  it('sem suporte a voz (web) → campo vazio mostra o enviar desabilitado, sem microfone', () => {
    mockSupported = false;
    const onSend = jest.fn().mockResolvedValue(true);
    const { getByTestId, queryByTestId } = render(<ChatInput onSend={onSend} disabled={false} />);
    expect(queryByTestId('chat-mic-btn')).toBeNull();
    fireEvent.press(getByTestId('chat-send-btn'));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('microfone desabilitado enquanto o coach responde', async () => {
    const onSend = jest.fn().mockResolvedValue(true);
    const { getByTestId } = render(<ChatInput onSend={onSend} disabled />);
    const mic = getByTestId('chat-mic-btn');
    expect(mic.props.accessibilityState?.disabled).toBe(true);
    await act(async () => {
      fireEvent.press(mic);
    });
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('tocar no mic → estado gravando com cronômetro, parar e cancelar', async () => {
    jest.useFakeTimers();
    const onSend = jest.fn().mockResolvedValue(true);
    const { getByTestId, queryByPlaceholderText } = render(
      <ChatInput onSend={onSend} disabled={false} />,
    );
    await act(async () => {
      fireEvent.press(getByTestId('chat-mic-btn'));
    });
    expect(getByTestId('chat-mic-stop-btn')).toBeTruthy();
    expect(getByTestId('chat-mic-cancel-btn')).toBeTruthy();
    expect(getByTestId('chat-mic-timer')).toHaveTextContent('0:00');
    expect(queryByPlaceholderText('Pergunte ao Coach...')).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(getByTestId('chat-mic-timer')).toHaveTextContent('0:05');
  });

  it('parar → transcreve e envia o texto como mensagem', async () => {
    const onSend = jest.fn().mockResolvedValue(true);
    const { getByTestId } = render(<ChatInput onSend={onSend} disabled={false} />);
    await act(async () => {
      fireEvent.press(getByTestId('chat-mic-btn'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('chat-mic-stop-btn'));
    });
    expect(mockTranscribe).toHaveBeenCalledWith('QUFBQQ==', 'audio/m4a');
    expect(onSend).toHaveBeenCalledWith('quanto de proteína hoje?');
    expect(getByTestId('chat-mic-btn')).toBeTruthy();
  });

  it('cancelar → nada é enviado', async () => {
    const onSend = jest.fn().mockResolvedValue(true);
    const { getByTestId } = render(<ChatInput onSend={onSend} disabled={false} />);
    await act(async () => {
      fireEvent.press(getByTestId('chat-mic-btn'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('chat-mic-cancel-btn'));
    });
    expect(mockCancel).toHaveBeenCalled();
    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
    expect(getByTestId('chat-mic-btn')).toBeTruthy();
  });

  it('durante a transcrição o input fica desabilitado com indicador', async () => {
    let resolve: (t: string) => void = () => {};
    mockTranscribe.mockReturnValue(new Promise((r) => (resolve = r)));
    const onSend = jest.fn().mockResolvedValue(true);
    const { getByTestId, getByPlaceholderText } = render(
      <ChatInput onSend={onSend} disabled={false} />,
    );
    await act(async () => {
      fireEvent.press(getByTestId('chat-mic-btn'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('chat-mic-stop-btn'));
    });
    expect(getByTestId('chat-transcribing-indicator')).toBeTruthy();
    expect(getByPlaceholderText('Transcrevendo áudio...').props.editable).toBe(false);

    await act(async () => {
      resolve('oi');
    });
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('oi'));
  });

  it('permissão negada → alerta e nada gravado', async () => {
    mockPermission.mockResolvedValue(false);
    const onSend = jest.fn().mockResolvedValue(true);
    const { getByTestId, queryByTestId } = render(<ChatInput onSend={onSend} disabled={false} />);
    await act(async () => {
      fireEvent.press(getByTestId('chat-mic-btn'));
    });
    expect(alertSpy).toHaveBeenCalled();
    expect(mockStart).not.toHaveBeenCalled();
    expect(queryByTestId('chat-mic-stop-btn')).toBeNull();
  });

  it('transcribe 503 → alerta "Áudio indisponível no momento"', async () => {
    mockTranscribe.mockRejectedValue(httpError(503, 'TRANSCRIBE_UNAVAILABLE'));
    const onSend = jest.fn().mockResolvedValue(true);
    const { getByTestId } = render(<ChatInput onSend={onSend} disabled={false} />);
    await act(async () => {
      fireEvent.press(getByTestId('chat-mic-btn'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('chat-mic-stop-btn'));
    });
    expect(alertSpy.mock.calls[0][0]).toBe('Áudio indisponível no momento');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('transcribe 422 → alerta "Não entendi o áudio, tenta de novo"', async () => {
    mockTranscribe.mockRejectedValue(httpError(422, 'EMPTY_TRANSCRIPTION'));
    const onSend = jest.fn().mockResolvedValue(true);
    const { getByTestId } = render(<ChatInput onSend={onSend} disabled={false} />);
    await act(async () => {
      fireEvent.press(getByTestId('chat-mic-btn'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('chat-mic-stop-btn'));
    });
    expect(alertSpy.mock.calls[0][0]).toBe('Não entendi o áudio, tenta de novo');
    expect(onSend).not.toHaveBeenCalled();
  });
});
