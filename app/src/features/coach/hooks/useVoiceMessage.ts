import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking } from 'react-native';
import axios from 'axios';
import { useAuthStore } from '@features/auth/store';
import { coachService, VoiceRequestContext } from '@shared/services/coach.service';
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

export type VoiceStatus =
  'idle' | 'starting' | 'recording' | 'transcribing' | 'cancelling' | 'cleanupFailed';

interface Options {
  onSend: (text: string, voice?: VoiceRequestContext) => Promise<boolean>;
  isFocused?: boolean;
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
  Alert.alert('Áudio muito curto', 'Fale um pouco mais antes de parar a gravação.');
}

/** Falha do aparelho (parar/ler a gravação), não da rede. */
function showRecordingError(needsRestart = false): void {
  Alert.alert(
    'Não foi possível gravar o áudio',
    needsRestart ? 'Feche e reabra o aplicativo para liberar o microfone.' : 'Tente de novo.',
  );
}

/**
 * Mensagem por voz para o coach: grava (até 60 s), transcreve no backend e
 * entrega o texto ao `onSend` — o usuário vê a própria fala como bolha.
 */
interface VoiceOperation {
  controller: AbortController;
  sessionGeneration: number;
  userId: string;
  recording: ActiveRecording | null;
  startedAt: number;
}

export function useVoiceMessage({ onSend, disabled, isFocused = true }: Options) {
  const [status, setStatusState] = useState<VoiceStatus>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const statusRef = useRef<VoiceStatus>('idle');
  const operationRef = useRef<VoiceOperation | null>(null);
  const nativeTaskRef = useRef<Promise<unknown> | null>(null);
  const cleanupFailedRef = useRef(false);
  const permissionPendingRef = useRef(false);
  const mountedRef = useRef(true);
  const focusedRef = useRef(isFocused);
  const appStateRef = useRef(AppState.currentState ?? 'active');
  const onSendRef = useRef(onSend);
  const disabledRef = useRef(disabled);
  focusedRef.current = isFocused;
  onSendRef.current = onSend;
  disabledRef.current = disabled;

  const setStatus = useCallback((next: VoiceStatus) => {
    statusRef.current = next;
    if (mountedRef.current) setStatusState(next);
  }, []);

  const isValid = useCallback((operation: VoiceOperation) => {
    const auth = useAuthStore.getState();
    return (
      mountedRef.current &&
      focusedRef.current &&
      operationRef.current === operation &&
      !operation.controller.signal.aborted &&
      auth.isAuthenticated &&
      auth.user?.id === operation.userId &&
      auth.sessionGeneration === operation.sessionGeneration
    );
  }, []);

  // A pending native cleanup owns the audio session until it actually settles.
  const runNative = useCallback(
    async <T>(work: () => Promise<T>): Promise<T> => {
      const task = work();
      nativeTaskRef.current = task;
      try {
        return await task;
      } catch (e) {
        if (e instanceof Error && e.message === 'RECORDING_CLEANUP_FAILED') {
          cleanupFailedRef.current = true;
          setStatus('cleanupFailed');
        }
        throw e;
      } finally {
        if (nativeTaskRef.current === task) {
          nativeTaskRef.current = null;
          if (!operationRef.current && !cleanupFailedRef.current) setStatus('idle');
        }
      }
    },
    [setStatus],
  );

  const cancel = useCallback(async () => {
    const operation = operationRef.current;
    if (!operation) return;
    operationRef.current = null;
    operation.controller.abort();
    const recording = operation.recording;
    operation.recording = null;
    if (mountedRef.current) setElapsedSeconds(0);
    if (nativeTaskRef.current || recording) setStatus('cancelling');
    else if (!cleanupFailedRef.current) setStatus('idle');
    try {
      if (recording) await runNative(() => recording.cancel());
      else await nativeTaskRef.current;
    } catch {
      if (
        cleanupFailedRef.current &&
        mountedRef.current &&
        focusedRef.current &&
        appStateRef.current === 'active'
      ) {
        Alert.alert(
          'Microfone indisponível',
          'Feche e reabra o aplicativo para liberar o microfone.',
        );
      }
    }
  }, [runNative, setStatus]);

  useEffect(() => {
    mountedRef.current = true;
    const unsubscribe = useAuthStore.subscribe((auth) => {
      const operation = operationRef.current;
      if (
        operation &&
        (!auth.isAuthenticated ||
          auth.user?.id !== operation.userId ||
          auth.sessionGeneration !== operation.sessionGeneration)
      ) {
        void cancel();
      }
    });
    const subscription = AppState.addEventListener('change', (next) => {
      appStateRef.current = next;
      // A permission dialog may be transiently inactive before recording starts.
      if (next !== 'active' && (next === 'background' || !permissionPendingRef.current)) {
        void cancel();
      }
    });
    return () => {
      mountedRef.current = false;
      unsubscribe();
      subscription.remove();
      void cancel();
    };
  }, [cancel]);

  useEffect(() => {
    if (!isFocused) void cancel();
  }, [isFocused, cancel]);

  const start = useCallback(async () => {
    const auth = useAuthStore.getState();
    if (
      !isVoiceSupported ||
      disabledRef.current ||
      !focusedRef.current ||
      appStateRef.current !== 'active' ||
      statusRef.current !== 'idle' ||
      nativeTaskRef.current ||
      cleanupFailedRef.current ||
      !auth.isAuthenticated ||
      !auth.user
    )
      return;
    const operation: VoiceOperation = {
      controller: new AbortController(),
      sessionGeneration: auth.sessionGeneration,
      userId: auth.user.id,
      recording: null,
      startedAt: 0,
    };
    operationRef.current = operation;
    setStatus('starting');
    try {
      const recording = await runNative(async () => {
        permissionPendingRef.current = true;
        let granted: boolean;
        try {
          granted = await requestMicrophonePermission();
        } finally {
          permissionPendingRef.current = false;
        }
        if (!isValid(operation) || appStateRef.current !== 'active') return null;
        if (!granted) {
          showPermissionDenied();
          return null;
        }
        const prepared = await startVoiceRecording(
          () => isValid(operation) && appStateRef.current === 'active',
        );
        if (!isValid(operation) || appStateRef.current !== 'active') {
          await prepared.cancel();
          return null;
        }
        return prepared;
      });
      if (!isValid(operation)) {
        if (recording) await runNative(() => recording.cancel());
        return;
      }
      if (!recording) {
        operationRef.current = null;
        setStatus('idle');
        return;
      }
      operation.recording = recording;
      operation.startedAt = Date.now();
      setElapsedSeconds(0);
      setStatus('recording');
    } catch {
      if (!isValid(operation)) return;
      operationRef.current = null;
      if (!cleanupFailedRef.current) setStatus('idle');
      Alert.alert(
        'Não consegui usar o microfone',
        cleanupFailedRef.current
          ? 'Feche e reabra o aplicativo para liberar o microfone.'
          : 'Tente de novo em instantes.',
      );
    }
  }, [isValid, runNative, setStatus]);

  const stop = useCallback(async () => {
    const operation = operationRef.current;
    if (!operation?.recording || !isValid(operation) || appStateRef.current !== 'active') return;
    const recording = operation.recording;
    operation.recording = null;
    if (Date.now() - operation.startedAt < MIN_RECORDING_MS) {
      setStatus('cancelling');
      try {
        await runNative(() => recording.cancel());
        if (isValid(operation)) showTooShort();
      } catch {
        if (isValid(operation)) showRecordingError(cleanupFailedRef.current);
      } finally {
        if (isValid(operation)) {
          operationRef.current = null;
          if (!cleanupFailedRef.current) setStatus('idle');
        }
      }
      return;
    }
    setStatus('transcribing');
    let audio: string;
    try {
      audio = await runNative(() => recording.stop());
    } catch {
      if (!isValid(operation)) return;
      operationRef.current = null;
      if (!cleanupFailedRef.current) setStatus('idle');
      showRecordingError(cleanupFailedRef.current);
      return;
    }
    if (!isValid(operation) || appStateRef.current !== 'active') return;
    try {
      const text = await coachService.transcribe(
        audio,
        VOICE_MIME_TYPE,
        operation.controller.signal,
      );
      if (!isValid(operation) || appStateRef.current !== 'active') return;
      await onSendRef.current(text, {
        signal: operation.controller.signal,
        isValid: () => isValid(operation) && appStateRef.current === 'active',
      });
    } catch (e) {
      if (isValid(operation) && !axios.isCancel(e)) showTranscribeError(e);
    } finally {
      if (isValid(operation)) {
        operationRef.current = null;
        setStatus('idle');
      }
    }
  }, [isValid, runNative, setStatus]);

  useEffect(() => {
    if (status !== 'recording') return;
    const operation = operationRef.current;
    if (!operation) return;
    const id = setInterval(() => {
      if (!isValid(operation)) return;
      setElapsedSeconds(
        Math.min(Math.floor((Date.now() - operation.startedAt) / 1000), MAX_RECORDING_SECONDS),
      );
    }, 250);
    return () => clearInterval(id);
  }, [status, isValid]);

  useEffect(() => {
    if (status === 'recording' && elapsedSeconds >= MAX_RECORDING_SECONDS) void stop();
  }, [status, elapsedSeconds, stop]);

  return { isSupported: isVoiceSupported, status, elapsedSeconds, start, stop, cancel };
}
