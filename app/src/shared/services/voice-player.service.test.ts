import { setAudioModeAsync } from 'expo-audio';
import { playSpeech, saveSpeech, stopSpeech } from './voice-player.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const audio = require('expo-audio');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('expo-file-system');

const lastPlayer = () => audio.__players[audio.__players.length - 1];

beforeEach(() => {
  stopSpeech();
  jest.clearAllMocks();
});

it('saveSpeech grava o base64 no cache e devolve o uri', async () => {
  const uri = await saveSpeech('SUQz');
  const file = fs.__files[fs.__files.length - 1];
  expect(file.write).toHaveBeenCalledWith('SUQz', { encoding: 'base64' });
  expect(uri).toMatch(/^file:\/\/\/cache\/coach-reply-.*\.mp3$/);
});

it('playSpeech sai no alto-falante mesmo no silencioso, antes de tocar', async () => {
  await playSpeech('file:///cache/a.mp3', jest.fn());
  expect(setAudioModeAsync).toHaveBeenCalledWith({
    playsInSilentMode: true,
    allowsRecording: false,
  });
  expect(lastPlayer().source).toBe('file:///cache/a.mp3');
  expect(lastPlayer().play).toHaveBeenCalled();
});

it('uma nova reprodução para e libera a anterior', async () => {
  await playSpeech('file:///cache/a.mp3', jest.fn());
  const first = lastPlayer();
  await playSpeech('file:///cache/b.mp3', jest.fn());
  expect(first.pause).toHaveBeenCalled();
  expect(first.remove).toHaveBeenCalled();
  expect(lastPlayer()).not.toBe(first);
});

it('onEnd dispara quando a resposta termina, e o player é liberado', async () => {
  const onEnd = jest.fn();
  await playSpeech('file:///cache/a.mp3', onEnd);
  const player = lastPlayer();
  player.__emit({ didJustFinish: false });
  expect(onEnd).not.toHaveBeenCalled();
  player.__emit({ didJustFinish: true });
  expect(onEnd).toHaveBeenCalledTimes(1);
  expect(player.remove).toHaveBeenCalled();
});

it('stopSpeech para e libera; chamar sem player é seguro', async () => {
  stopSpeech();
  await playSpeech('file:///cache/a.mp3', jest.fn());
  const player = lastPlayer();
  stopSpeech();
  expect(player.pause).toHaveBeenCalled();
  expect(player.remove).toHaveBeenCalled();
});
