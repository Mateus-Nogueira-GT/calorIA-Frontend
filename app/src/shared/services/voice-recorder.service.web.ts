// Web: sem gravação de áudio (o microfone não aparece no ChatInput).
// Mesma assinatura do serviço nativo para manter os tipos.
import type { TranscribeMimeType } from './coach.service';

export const isVoiceSupported = false;
export const VOICE_MIME_TYPE: TranscribeMimeType = 'audio/webm';

export class VoiceRecordingError extends Error {
  constructor(
    code: string,
    readonly details?: unknown,
  ) {
    super(code);
    this.name = 'VoiceRecordingError';
  }
}

export interface ActiveRecording {
  stop(): Promise<string>;
  cancel(): Promise<void>;
}

export async function requestMicrophonePermission(): Promise<boolean> {
  return false;
}

export async function startVoiceRecording(_isValid?: () => boolean): Promise<ActiveRecording> {
  throw new Error('VOICE_NOT_SUPPORTED');
}
