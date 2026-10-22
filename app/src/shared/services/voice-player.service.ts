import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';

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

/** Remove só arquivos de TTS; gravações e outros caches pertencem a outros fluxos. */
export function deleteSpeech(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    /* Cache pode ter sido purgado pelo SO; limpeza não deve interromper o app. */
  }
}

/** Ao limpar a conversa, remove também sobras de execuções anteriores. */
export function clearSpeechCache(): void {
  stopSpeech();
  try {
    for (const entry of new Directory(Paths.cache).list()) {
      if (entry instanceof File && /^coach-reply-.*\.(wav|mp3)$/.test(entry.name))
        deleteSpeech(entry.uri);
    }
  } catch {
    /* Cache indisponível: o próximo clear tenta novamente. */
  }
}

/** Para e libera o player atual, se houver. Seguro chamar a qualquer momento. */
export function stopSpeech(): void {
  const active = current;
  current = null;
  if (!active) return;
  // Cada recurso é independente: falhar no pause não impede liberar o player.
  for (const release of [
    () => active.subscription.remove(),
    () => active.player.pause(),
    () => active.player.remove(),
  ]) {
    try {
      release();
    } catch {
      /* recurso já liberado pelo sistema */
    }
  }
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
