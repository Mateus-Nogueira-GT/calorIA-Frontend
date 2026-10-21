import { useAuthStore } from '@features/auth/store';
import { bindRequestToOwner, captureSessionOwner, isCurrentOwner } from './session-owner';

const USER = { id: 'u1', name: 'Rafael', email: 'rafael@exemplo.com' };
const OTHER_USER = { id: 'u2', name: 'Outra', email: 'other@test.com' };

describe('session owner', () => {
  beforeEach(() => {
    useAuthStore.getState().clearToken();
    useAuthStore.getState().setToken('access', USER, 'refresh');
  });

  it('invalida o dono no logout', () => {
    const owner = captureSessionOwner();
    expect(owner.userId).toBe('u1');
    expect(isCurrentOwner(owner)).toBe(true);

    useAuthStore.getState().clearToken();

    expect(isCurrentOwner(owner)).toBe(false);
  });

  it('invalida o dono ao trocar de usuário', () => {
    const owner = captureSessionOwner();

    useAuthStore.getState().setToken('other-access', OTHER_USER);

    expect(isCurrentOwner(owner)).toBe(false);
  });

  it('preserva o dono e o sinal ao renovar o token do mesmo usuário', () => {
    const owner = captureSessionOwner();
    const binding = bindRequestToOwner(owner);
    try {
      useAuthStore.getState().setToken('renewed-access', USER);

      expect(isCurrentOwner(owner)).toBe(true);
      expect(captureSessionOwner().generation).toBe(owner.generation);
      expect(binding.config.signal.aborted).toBe(false);
    } finally {
      binding.release();
    }
  });

  it('aborta o sinal de forma síncrona no logout e cria um sinal ativo na próxima sessão', () => {
    const binding = bindRequestToOwner(captureSessionOwner());
    expect(binding.config.signal.aborted).toBe(false);
    try {
      useAuthStore.getState().clearToken();
      expect(binding.config.signal.aborted).toBe(true);

      useAuthStore.getState().setToken('other-access', OTHER_USER);
      const nextBinding = bindRequestToOwner(captureSessionOwner());
      try {
        expect(nextBinding.config.signal.aborted).toBe(false);
        expect(nextBinding.config.caloriaOwner.userId).toBe('u2');
      } finally {
        nextBinding.release();
      }
    } finally {
      binding.release();
    }
  });

  it('aborta o sinal quando apenas a identidade muda', () => {
    const owner = captureSessionOwner();
    const binding = bindRequestToOwner(owner);
    try {
      useAuthStore.setState({ user: OTHER_USER });

      expect(isCurrentOwner(owner)).toBe(false);
      expect(binding.config.signal.aborted).toBe(true);
    } finally {
      binding.release();
    }
  });

  it('entrega um sinal já abortado para um dono antigo', () => {
    const owner = captureSessionOwner();
    useAuthStore.getState().clearToken();

    const binding = bindRequestToOwner(owner);
    try {
      expect(binding.config.signal.aborted).toBe(true);
    } finally {
      binding.release();
    }
  });

  it('propaga o cancelamento do chamador', () => {
    const caller = new AbortController();
    const binding = bindRequestToOwner(captureSessionOwner(), caller.signal);
    try {
      caller.abort();

      expect(binding.config.signal.aborted).toBe(true);
    } finally {
      binding.release();
    }
  });

  it('entrega um sinal abortado quando o chamador já cancelou', () => {
    const caller = new AbortController();
    caller.abort();

    const binding = bindRequestToOwner(captureSessionOwner(), caller.signal);
    try {
      expect(binding.config.signal.aborted).toBe(true);
    } finally {
      binding.release();
    }
  });

  it('release remove os listeners do chamador e da sessão', () => {
    const caller = new AbortController();
    const binding = bindRequestToOwner(captureSessionOwner(), caller.signal);

    binding.release();
    binding.release();
    caller.abort();
    useAuthStore.getState().clearToken();

    expect(binding.config.signal.aborted).toBe(false);
  });
});
