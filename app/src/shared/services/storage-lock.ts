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
  return locks?.request ? locks.request(name, action) : action();
}
