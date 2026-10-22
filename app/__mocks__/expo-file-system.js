// Mock do expo-file-system (API `File` do SDK 56).
const files = [];

class File {
  constructor(...uris) {
    this.uri = uris.join('/');
    this.name = this.uri.split('/').pop();
    this.exists = true;
    this.base64 = jest.fn(() => Promise.resolve(File.__nextBase64));
    this.delete = jest.fn();
    this.write = jest.fn();
    files.push(this);
  }
}
File.__nextBase64 = 'QUFBQQ==';

class Directory {
  constructor(uri) {
    this.uri = uri;
  }
  list() {
    return files.slice();
  }
}

const Paths = { cache: 'file:///cache' };

module.exports = { Directory, File, Paths, __files: files };
