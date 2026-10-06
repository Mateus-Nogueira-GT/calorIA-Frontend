import { Platform } from 'react-native';
import {
  AudioModule,
  AudioQuality,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { File } from 'expo-file-system';
import type { TranscribeMimeType } from './coach.service';

export const isVoiceSupported = true;
export const VOICE_MIME_TYPE: TranscribeMimeType = 'audio/m4a';

/**
 * Falha local da gravação (parar o gravador, arquivo ausente, leitura do
 * arquivo) — distinta de falha de rede/backend na transcrição.
 */
export class VoiceRecordingError extends Error {
  constructor(code: string, readonly details?: unknown) {
    super(code);
    this.name = 'VoiceRecordingError';
  }
}

export interface ActiveRecording {
  /** Para a gravação e devolve o áudio em base64 puro (o arquivo é apagado). */
  stop(): Promise<string>;
  /** Para e descarta a gravação. */
  cancel(): Promise<void>;
}

/**
 * Voz falada não precisa de mais que isso: AAC mono 32 kbps ≈ 240 KB por
 * minuto, bem abaixo do teto do backend. Não dá para usar o preset
 * LOW_QUALITY do expo-audio: no Android ele grava 3gp/AMR, que o backend
 * (Whisper) não aceita — aqui é AAC em container MPEG-4 nas duas plataformas.
 * Opções já "achatadas" por plataforma, como o useAudioRecorder faz.
 */
const COMMON_OPTIONS = {
  extension: '.m4a',
  sampleRate: 22050,
  numberOfChannels: 1,
  bitRate: 32000,
  isMeteringEnabled: false,
};

function recordingOptions() {
  if (Platform.OS === 'android') {
    return { ...COMMON_OPTIONS, outputFormat: 'mpeg4', audioEncoder: 'aac' };
  }
  return {
    ...COMMON_OPTIONS,
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.LOW,
  };
}

export async function requestMicrophonePermission(): Promise<boolean> {
  const { granted } = await requestRecordingPermissionsAsync();
  return granted;
}

async function restoreAudioMode(): Promise<void> {
  // No iOS, a sessão playAndRecord joga o som para o alto-falante de chamada.
  await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
}

export async function startVoiceRecording(): Promise<ActiveRecording> {
  // Tudo dentro do try (inclusive o construtor nativo): qualquer falha devolve
  // o modo de áudio normal em vez de deixar a sessão de gravação aberta.
  let recorder: InstanceType<typeof AudioModule.AudioRecorder> | null = null;
  try {
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    recorder = new AudioModule.AudioRecorder(recordingOptions());
    await recorder.prepareToRecordAsync();
    recorder.record();
  } catch (e) {
    try {
      recorder?.release();
    } catch {
      // já falhou; o importante é restaurar o modo de áudio
    }
    await restoreAudioMode();
    throw e;
  }
  const active = recorder;

  // O arquivo já existe depois do prepare; guarda o caminho caso o nativo
  // não o exponha mais depois do stop.
  const startedUri = active.uri;
  let finished = false;

  async function finish(read: boolean): Promise<string> {
    if (finished) throw new VoiceRecordingError('RECORDING_ALREADY_FINISHED');
    finished = true;
    try {
      let stopError: unknown = null;
      try {
        await active.stop();
      } catch (e) {
        stopError = e;
      }
      const uri = active.uri || startedUri;
      // Apaga o temporário mesmo quando o stop falhou.
      const file = uri ? new File(uri) : null;
      try {
        if (stopError) throw new VoiceRecordingError('RECORDING_STOP_FAILED', stopError);
        if (!file) throw new VoiceRecordingError('RECORDING_WITHOUT_FILE');
        if (!read) return '';
        try {
          return await file.base64();
        } catch (e) {
          throw new VoiceRecordingError('RECORDING_READ_FAILED', e);
        }
      } finally {
        try {
          file?.delete();
        } catch {
          // arquivo temporário no cache: se não der para apagar, o SO limpa.
        }
      }
    } finally {
      try {
        active.release();
      } catch {
        // nada a fazer
      }
      await restoreAudioMode();
    }
  }

  return {
    stop: () => finish(true),
    cancel: async () => {
      await finish(false);
    },
  };
}
