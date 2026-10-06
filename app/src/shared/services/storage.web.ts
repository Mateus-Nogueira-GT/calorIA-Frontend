import type { StateStorage } from 'zustand/middleware';

// Keep the native AsyncStorage module out of the browser bundle.
export const kvStorage: StateStorage = {
  getItem: (name) => {
    try {
      return Promise.resolve(window.localStorage.getItem(name));
    } catch {
      return Promise.resolve(null);
    }
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value);
    } catch {
      // storage cheio/bloqueado — sessão segue só em memória
    }
    return Promise.resolve();
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name);
    } catch {
      // idem
    }
    return Promise.resolve();
  },
};
