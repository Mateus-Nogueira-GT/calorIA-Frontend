// Mock do expo-audio (módulo nativo): o gravador grava em memória e expõe a
// última instância criada para os testes inspecionarem as opções.
const recorders = [];

class AudioRecorder {
  constructor(options) {
    this.options = options;
    this.uri = null;
    this.isRecording = false;
    this.prepareToRecordAsync = jest.fn(() => Promise.resolve());
    this.record = jest.fn(() => {
      this.isRecording = true;
    });
    this.stop = jest.fn(() => {
      this.isRecording = false;
      this.uri = 'file:///cache/recording.m4a';
      return Promise.resolve();
    });
    this.release = jest.fn();
    recorders.push(this);
  }
}

const players = [];
class AudioPlayer {
  constructor(source) {
    this.source = source;
    this.listeners = [];
    this.play = jest.fn();
    this.pause = jest.fn();
    this.remove = jest.fn();
    this.addListener = jest.fn((event, listener) => {
      this.listeners.push({ event, listener });
      return { remove: jest.fn() };
    });
    players.push(this);
  }
  /** Teste: dispara um status de reprodução. */
  __emit(status) {
    for (const { event, listener } of this.listeners)
      if (event === 'playbackStatusUpdate') listener(status);
  }
}

module.exports = {
  createAudioPlayer: jest.fn((source) => new AudioPlayer(source)),
  __players: players,
  AudioModule: { AudioRecorder },
  requestRecordingPermissionsAsync: jest.fn(() =>
    Promise.resolve({ granted: true, status: 'granted', canAskAgain: true, expires: 'never' }),
  ),
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  AudioQuality: { MIN: 0, LOW: 0x20, MEDIUM: 0x40, HIGH: 0x60, MAX: 0x7f },
  IOSOutputFormat: { MPEG4AAC: 'aac ' },
  __recorders: recorders,
};
