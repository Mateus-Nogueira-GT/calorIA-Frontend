// Mock em memória do AsyncStorage (o pacote v3 não traz mais o mock de jest).
let store = {};

module.exports = {
  setItem: jest.fn((key, value) => {
    store[key] = String(value);
    return Promise.resolve();
  }),
  getItem: jest.fn((key) => Promise.resolve(store[key] ?? null)),
  removeItem: jest.fn((key) => {
    delete store[key];
    return Promise.resolve();
  }),
  clear: jest.fn(() => {
    store = {};
    return Promise.resolve();
  }),
  getAllKeys: jest.fn(() => Promise.resolve(Object.keys(store))),
  multiGet: jest.fn((keys) => Promise.resolve(keys.map((key) => [key, store[key] ?? null]))),
  multiSet: jest.fn((pairs) => {
    for (const [key, value] of pairs) {
      store[key] = String(value);
    }
    return Promise.resolve();
  }),
  multiRemove: jest.fn((keys) => {
    for (const key of keys) {
      delete store[key];
    }
    return Promise.resolve();
  }),
};
