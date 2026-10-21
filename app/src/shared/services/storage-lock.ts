interface LockManagerLike {
  request<T>(name: string, action: () => Promise<T>): Promise<T>;
}

/**
 * Exclusão mútua entre abas da mesma origem (Web Locks API). No app nativo e em
 * navegadores sem Web Locks (Safari < 15.4) roda direto: o nativo tem um único
 * runtime JS, e a fila em memória de quem chama continua serializando ali.
 */
export function withStorageLock<T>(name: string, action: () => Promise<T>): Promise<T> {
  const locks =
    typeof navigator !== 'undefined' ? (navigator as { locks?: LockManagerLike }).locks : undefined;
  if (!locks?.request) return action();
  let started = false;
  return locks
    .request(name, () => {
      started = true;
      return action();
    })
    .catch((error: unknown) => {
      // Iframe sandboxado/origem opaca recusa o lock (SecurityError): segue
      // sem ele em vez de bloquear foto e coach. Erro da própria ação sobe.
      if (started) throw error;
      return action();
    });
}
