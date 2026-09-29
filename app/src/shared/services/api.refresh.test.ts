import { useAuthStore } from '@features/auth/store';
import { applyRefreshedSession } from './api';

const USER = { id: 'u1', name: 'Rafael', email: 'rafael@exemplo.com' };

describe('applyRefreshedSession', () => {
  beforeEach(() => {
    useAuthStore.getState().clearToken();
  });

  it('no onboarding (só pendingAuth) renova a sessão pendente sem autenticar nem marcar o perfil como completo', () => {
    useAuthStore.getState().setPendingAuth('old-access', USER, 'old-refresh');

    applyRefreshedSession('new-access', 'new-refresh', USER);

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.token).toBeNull();
    expect(state.profileComplete).toBeNull();
    expect(state.pendingAuth).toEqual({ token: 'new-access', refreshToken: 'new-refresh', user: USER });
  });

  it('com sessão normal troca o token e mantém profileComplete', () => {
    useAuthStore.getState().setToken('old-access', USER, 'old-refresh');
    useAuthStore.getState().setProfileComplete(false);

    applyRefreshedSession('new-access', 'new-refresh', USER);

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.token).toBe('new-access');
    expect(state.refreshToken).toBe('new-refresh');
    expect(state.profileComplete).toBe(false);
  });
});
