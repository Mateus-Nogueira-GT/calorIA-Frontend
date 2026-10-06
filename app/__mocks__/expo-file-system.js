// Mock do expo-file-system (API `File` do SDK 56).
const files = [];

class File {
  constructor(...uris) {
    this.uri = uris.join('/');
    this.base64 = jest.fn(() => Promise.resolve(File.__nextBase64));
    this.delete = jest.fn();
    files.push(this);
  }
}
File.__nextBase64 = 'QUFBQQ==';

module.exports = { File, __files: files };
