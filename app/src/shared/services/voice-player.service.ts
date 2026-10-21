import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';

/** Resposta do Coach em áudio: só no nativo (o web nem grava voz). */
export const isSpeechSupported = true;

let current: { player: AudioPlayer; subscription: { remove: () => void } } | null = null;
let sequence = 0;

export type SpeechMimeType = 'audio/wav' | 'audio/mpeg';

/**
 * Grava o áudio (base64) no cache e devolve o uri para tocar depois. A
 * extensão segue o formato: o player do iOS identifica o arquivo por ela.
 */
export async function saveSpeech(base64: string, mimeType: SpeechMimeType): Promise<string> {
  const extension = mimeType === 'audio/wav' ? 'wav' : 'mp3';
  const file = new File(Paths.cache, `coach-reply-${Date.now()}-${sequence++}.${extension}`);
  file.write(base64, { encoding: 'base64' });
  return file.uri;
}

/** Para e libera o player atual, se houver. Seguro chamar a qualquer momento. */
export function stopSpeech(): void {
  const active = current;
  current = null;
  if (!active) return;
  active.subscription.remove();
  try {
    active.player.pause();
  } catch {
    /* player já liberado pelo sistema */
  }
  active.player.remove();
}

/**
 * Toca uma resposta por vez. playsInSilentMode: sai no alto-falante mesmo com
 * o iPhone no silencioso; allowsRecording: false tira a sessão do modo de
 * gravação (no iOS, gravação manda o som para o fone de ouvido do aparelho).
 */
export async function playSpeech(uri: string, onEnd: () => void): Promise<void> {
  stopSpeech();
  await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
  const player = createAudioPlayer(uri);
  const subscription = player.addListener('playbackStatusUpdate', (status) => {
    if (!status.didJustFinish || current?.player !== player) return;
    stopSpeech();
    onEnd();
  });
  current = { player, subscription };
  player.play();
}
