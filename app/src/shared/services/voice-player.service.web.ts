// Web: sem resposta em áudio (o web também não grava voz). Mesma assinatura.
export const isSpeechSupported = false;

export type SpeechMimeType = 'audio/wav' | 'audio/mpeg';

export async function saveSpeech(_base64: string, _mimeType: SpeechMimeType): Promise<string> {
  throw new Error('SPEECH_UNSUPPORTED');
}

export function stopSpeech(): void {}

export async function playSpeech(_uri: string, _onEnd: () => void): Promise<void> {}

export function deleteSpeech(_uri: string): void {}

export function clearSpeechCache(): void {}
