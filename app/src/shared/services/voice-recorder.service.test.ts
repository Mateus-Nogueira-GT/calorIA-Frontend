import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  isVoiceSupported,
  requestMicrophonePermission,
  startVoiceRecording,
  VOICE_MIME_TYPE,
} from './voice-recorder.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const audio = require('expo-audio');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('expo-file-system');

function lastRecorder() {
  return audio.__recorders[audio.__recorders.length - 1];
}

describe('voice-recorder.service (nativo)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    audio.__recorders.length = 0;
    fs.__files.length = 0;
  });

  it('é suportado no nativo e grava m4a', () => {
    expect(isVoiceSupported).toBe(true);
    expect(VOICE_MIME_TYPE).toBe('audio/m4a');
  });

  it('permissão: true quando concedida, false quando negada', async () => {
    expect(await requestMicrophonePermission()).toBe(true);
    audio.requestRecordingPermissionsAsync.mockResolvedValueOnce({ granted: false, status: 'denied' });
    expect(await requestMicrophonePermission()).toBe(false);
  });

  it('inicia: libera gravação no modo de áudio, prepara e grava em AAC mono', async () => {
    await startVoiceRecording();

    expect(audio.setAudioModeAsync).toHaveBeenCalledWith(
      expect.objectContaining({ allowsRecording: true, playsInSilentMode: true }),
    );
    const rec = lastRecorder();
    expect(rec.prepareToRecordAsync).toHaveBeenCalled();
    expect(rec.record).toHaveBeenCalled();
    expect(rec.options.numberOfChannels).toBe(1);
    expect(rec.options.extension).toBe('.m4a');
    // O preset LOW_QUALITY do expo-audio grava 3gp/AMR no Android — o backend
    // não aceita; aqui é sempre AAC em container MPEG-4.
    expect(rec.options.bitRate).toBeLessThanOrEqual(64000);
  });

  it('parar: devolve o base64 do arquivo, apaga o arquivo e libera o gravador', async () => {
    const recording = await startVoiceRecording();
    const base64 = await recording.stop();

    const rec = lastRecorder();
    expect(rec.stop).toHaveBeenCalled();
    expect(base64).toBe('QUFBQQ==');
    const file = fs.__files[0];
    expect(file.uri).toBe('file:///cache/recording.m4a');
    expect(file.delete).toHaveBeenCalled();
    expect(rec.release).toHaveBeenCalled();
    expect(audio.setAudioModeAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ allowsRecording: false }),
    );
  });

  it('cancelar: para, apaga o arquivo e não lê nada', async () => {
    const recording = await startVoiceRecording();
    await recording.cancel();

    const rec = lastRecorder();
    expect(rec.stop).toHaveBeenCalled();
    expect(rec.release).toHaveBeenCalled();
    const file = fs.__files[0];
    expect(file.base64).not.toHaveBeenCalled();
    expect(file.delete).toHaveBeenCalled();
  });
});
