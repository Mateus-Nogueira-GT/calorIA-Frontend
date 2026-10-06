import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';
import axios from 'axios';
import { coachService } from '@shared/services/coach.service';
import {
  ActiveRecording,
  isVoiceSupported,
  requestMicrophonePermission,
  startVoiceRecording,
  VOICE_MIME_TYPE,
} from '@shared/services/voice-recorder.service';

/** Teto da gravação: ao chegar nele, para e envia sozinho. */
export const MAX_RECORDING_SECONDS = 60;
/** Abaixo disso foi toque sem querer: descarta sem gastar uma transcrição. */
export const MIN_RECORDING_MS = 1000;

export type VoiceStatus = 'idle' | 'starting' | 'recording' | 'transcribing';

interface Options {
  onSend: (text: string) => Promise<boolean>;
  /** Coach respondendo: não deixa começar a gravar. */
  disabled: boolean;
}

function showPermissionDenied(): void {
  Alert.alert(
    'Microfone bloqueado',
    'Para falar com seu mentor, libere o microfone para o CalorIA nas Configurações do aparelho.',
    [
      { text: 'Agora não', style: 'cancel' },
      { text: 'Abrir configurações', onPress: () => void Linking.openSettings() },
    ],
  );
}

function showTranscribeError(e: unknown): void {
  const status = axios.isAxiosError(e) ? e.response?.status : undefined;
  const code = axios.isAxiosError(e)
    ? (e.response?.data as { error?: string } | undefined)?.error
    : undefined;

  if (status === 422 || code === 'INVALID_AUDIO') {
    Alert.alert('Não entendi o áudio, tenta de novo', 'Fale perto do microfone e grave outra vez.');
  } else if (status === 503) {
    Alert.alert('Áudio indisponível no momento', 'Enquanto isso, escreva sua mensagem.');
  } else if (status === 429 && code === 'TOO_MANY_REQUESTS') {
    Alert.alert('Muitos áudios seguidos', 'Espere um minutinho e tente de novo.');
  } else if (status === 429) {
    Alert.alert('Limite diário atingido', 'Você atingiu o limite diário do coach. Volte amanhã.');
  } else if (status === 413) {
    Alert.alert('Áudio muito longo', 'Grave mensagens de até 1 minuto.');
  } else {
    Alert.alert('Não consegui transcrever o áudio', 'Verifique sua conexão e tente de novo.');
  }
}

function showTooShort(): void {
  Alert.alert('Áudio muito curto', 'Segure um pouco mais para gravar sua mensagem.');
}

/** Falha do aparelho (parar/ler a gravação), não da rede. */
function showRecordingError(): void {
  Alert.alert('Não foi possível gravar o áudio', 'Tente de novo.');
}

/**
 * Mensagem por voz para o coach: grava (até 60 s), transcreve no backend e
 * entrega o texto ao `onSend` — o usuário vê a própria fala como bolha.
 */
export function useVoiceMessage({ onSend, disabled }: Options) {
  const [status, setStatusState] = useState<VoiceStatus>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const statusRef = useRef<VoiceStatus>('idle');
  const recordingRef = useRef<ActiveRecording | null>(null);
  const startedAtRef = useRef(0);
  const mountedRef = useRef(true);
  const onSendRef = useRef(onSend);
  const disabledRef = useRef(disabled);
  onSendRef.current = onSend;
  disabledRef.current = disabled;

  const setStatus = useCallback((next: VoiceStatus) => {
    statusRef.current = next;
    if (mountedRef.current) setStatusState(next);
  }, []);

  // Saiu da tela gravando → descarta (não envia nada que o usuário não confirmou).
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const recording = recordingRef.current;
      recordingRef.current = null;
      void recording?.cancel().catch(() => undefined);
    };
  }, []);

  const start = useCallback(async () => {
    if (!isVoiceSupported || disabledRef.current || statusRef.current !== 'idle') return;
    setStatus('starting');
    try {
      if (!(await requestMicrophonePermission())) {
        setStatus('idle');
        showPermissionDenied();
        return;
      }
      const recording = await startVoiceRecording();
      if (!mountedRef.current) {
        void recording.cancel().catch(() => undefined);
        return;
      }
      recordingRef.current = recording;
      startedAtRef.current = Date.now();
      setElapsedSeconds(0);
      setStatus('recording');
    } catch {
      setStatus('idle');
      Alert.alert('Não consegui usar o microfone', 'Tente de novo em instantes.');
    }
  }, [setStatus]);

  const stop = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) return;
    recordingRef.current = null;

    if (Date.now() - startedAtRef.current < MIN_RECORDING_MS) {
      setStatus('idle');
      await recording.cancel().catch(() => undefined);
      if (mountedRef.current) showTooShort();
      return;
    }

    setStatus('transcribing');
    let audio: string;
    try {
      audio = await recording.stop();
    } catch {
      setStatus('idle');
      if (mountedRef.current) showRecordingError();
      return;
    }
    let text: string;
    try {
      text = await coachService.transcribe(audio, VOICE_MIME_TYPE);
    } catch (e) {
      setStatus('idle');
      if (mountedRef.current) showTranscribeError(e);
      return;
    }
    setStatus('idle');
    await onSendRef.current(text);
  }, [setStatus]);

  const cancel = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) return;
    recordingRef.current = null;
    setStatus('idle');
    await recording.cancel().catch(() => undefined);
  }, [setStatus]);

  // Cronômetro pelo relógio (setInterval sozinho atrasa com a JS thread ocupada).
  useEffect(() => {
    if (status !== 'recording') return;
    const startedAt = Date.now();
    const id = setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      setElapsedSeconds(Math.min(seconds, MAX_RECORDING_SECONDS));
    }, 250);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => {
    if (status === 'recording' && elapsedSeconds >= MAX_RECORDING_SECONDS) {
      void stop();
    }
  }, [status, elapsedSeconds, stop]);

  return { isSupported: isVoiceSupported, status, elapsedSeconds, start, stop, cancel };
}
