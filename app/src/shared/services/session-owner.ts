import { useAuthStore } from '@features/auth/store';

export interface SessionOwner {
  userId: string | undefined;
  generation: number;
}

export function captureSessionOwner(): SessionOwner {
  const { user, sessionGeneration } = useAuthStore.getState();
  return { userId: user?.id, generation: sessionGeneration };
}

export function isCurrentOwner(owner: SessionOwner): boolean {
  const current = captureSessionOwner();
  return owner.userId === current.userId && owner.generation === current.generation;
}

let sessionController: AbortController | undefined;

function getSessionSignal(): AbortSignal {
  // Auth imports services through its stores; wait until a request binds before
  // reading/subscribing to the initialized auth store.
  if (!sessionController) {
    sessionController = new AbortController();
    useAuthStore.subscribe((state, previous) => {
      if (
        state.sessionGeneration === previous.sessionGeneration &&
        state.user?.id === previous.user?.id
      ) {
        return;
      }
      const previousController = sessionController;
      sessionController = new AbortController();
      previousController?.abort();
    });
  }
  return sessionController.signal;
}

export function bindRequestToOwner(
  owner: SessionOwner,
  signal?: AbortSignal,
): {
  config: { caloriaOwner: SessionOwner; signal: AbortSignal };
  release: () => void;
} {
  const sessionSignal = getSessionSignal();
  const controller = new AbortController();
  const abort = () => controller.abort();
  const release = () => {
    sessionSignal.removeEventListener('abort', abort);
    signal?.removeEventListener('abort', abort);
  };

  if (!isCurrentOwner(owner) || sessionSignal.aborted || signal?.aborted) {
    controller.abort();
  } else {
    sessionSignal.addEventListener('abort', abort, { once: true });
    signal?.addEventListener('abort', abort, { once: true });
  }

  return { config: { caloriaOwner: owner, signal: controller.signal }, release };
}
