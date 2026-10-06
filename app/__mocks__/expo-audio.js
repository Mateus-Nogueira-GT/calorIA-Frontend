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

module.exports = {
  AudioModule: { AudioRecorder },
  requestRecordingPermissionsAsync: jest.fn(() =>
    Promise.resolve({ granted: true, status: 'granted', canAskAgain: true, expires: 'never' }),
  ),
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  AudioQuality: { MIN: 0, LOW: 0x20, MEDIUM: 0x40, HIGH: 0x60, MAX: 0x7f },
  IOSOutputFormat: { MPEG4AAC: 'aac ' },
  __recorders: recorders,
};
