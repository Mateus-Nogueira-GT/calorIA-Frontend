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
  await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
  const recorder = new AudioModule.AudioRecorder(recordingOptions());
  try {
    await recorder.prepareToRecordAsync();
    recorder.record();
  } catch (e) {
    recorder.release();
    await restoreAudioMode();
    throw e;
  }

  // O arquivo já existe depois do prepare; guarda o caminho caso o nativo
  // não o exponha mais depois do stop.
  const startedUri = recorder.uri;
  let finished = false;

  async function finish(read: boolean): Promise<string> {
    if (finished) throw new Error('RECORDING_ALREADY_FINISHED');
    finished = true;
    try {
      await recorder.stop();
      const uri = recorder.uri || startedUri;
      if (!uri) throw new Error('RECORDING_WITHOUT_FILE');
      const file = new File(uri);
      try {
        return read ? await file.base64() : '';
      } finally {
        try {
          file.delete();
        } catch {
          // arquivo temporário no cache: se não der para apagar, o SO limpa.
        }
      }
    } finally {
      recorder.release();
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
