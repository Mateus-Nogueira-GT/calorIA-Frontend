// Web: sem gravação de áudio (o microfone não aparece no ChatInput).
// Mesma assinatura do serviço nativo para manter os tipos.
import type { TranscribeMimeType } from './coach.service';

export const isVoiceSupported = false;
export const VOICE_MIME_TYPE: TranscribeMimeType = 'audio/webm';

export interface ActiveRecording {
  stop(): Promise<string>;
  cancel(): Promise<void>;
}

export async function requestMicrophonePermission(): Promise<boolean> {
  return false;
}

export async function startVoiceRecording(): Promise<ActiveRecording> {
  throw new Error('VOICE_NOT_SUPPORTED');
}
