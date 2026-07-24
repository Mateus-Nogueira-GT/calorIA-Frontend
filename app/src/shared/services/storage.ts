import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StateStorage } from 'zustand/middleware';

/**
 * Storage único para os stores persistidos (zustand/persist).
 * Nativo: AsyncStorage. Web: localStorage (síncrono, embrulhado em Promise)
 * — evita depender do shim web do AsyncStorage no bundle do webpack.
 */
const webStorage: StateStorage = {
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

export const kvStorage: StateStorage =
  Platform.OS === 'web' && typeof window !== 'undefined' ? webStorage : AsyncStorage;
