import { useAuthStore } from './store';

describe('useAuthStore', () => {
  const originalWindow = global.window;

  afterEach(() => {
    useAuthStore.setState({
      token: null,
      user: null,
      isAuthenticated: false,
      pendingAuth: null,
      profilePreferences: {
        goal: null,
        coachPersonality: null,
      },
    });

    if (originalWindow === undefined) {
      // @ts-expect-error test cleanup for environments without window
      delete global.window;
    } else {
      Object.defineProperty(global, 'window', {
        configurable: true,
        value: originalWindow,
      });
    }
  });

  it('remove o preview do app ao limpar a sessao no web', () => {
    const replaceState = jest.fn();

    Object.defineProperty(global, 'window', {
      configurable: true,
      value: {
        location: {
          href: 'http://localhost:3000/?preview=app&foo=bar',
        },
        history: {
          replaceState,
        },
      },
    });

    useAuthStore.setState({
      token: 'tok',
      user: { id: '1', name: 'Maria', email: 'maria@test.com' },
      isAuthenticated: true,
      pendingAuth: null,
      profilePreferences: {
        goal: 'health',
        coachPersonality: 'empathetic',
      },
    });

    useAuthStore.getState().clearToken();

    expect(replaceState).toHaveBeenCalledWith({}, '', '/?foo=bar');
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('persiste metas e personalidade por usuario e reidrata no proximo login', () => {
    const storage = new Map<string, string>();

    Object.defineProperty(global, 'window', {
      configurable: true,
      value: {
        location: {
          href: 'http://localhost:3000/',
        },
        history: {
          replaceState: jest.fn(),
        },
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            storage.set(key, value);
          },
        },
      },
    });

    useAuthStore.getState().setPendingAuth('tok', {
      id: 'user-1',
      name: 'Maria',
      email: 'maria@test.com',
    });
    useAuthStore.getState().setProfilePreferences({
      goal: 'health',
      coachPersonality: 'empathetic',
    });

    useAuthStore.getState().clearToken();

    useAuthStore.getState().setToken('tok-2', {
      id: 'user-1',
      name: 'Maria',
      email: 'maria@test.com',
    });

    expect(useAuthStore.getState().profilePreferences).toEqual({
      goal: 'health',
      coachPersonality: 'empathetic',
    });
  });

  it('prioriza preferencias vindas do backend quando elas estiverem no user', () => {
    const storage = new Map<string, string>([
      [
        'caloria:profile-preferences',
        JSON.stringify({
          'user-1': {
            goal: 'health',
            coachPersonality: 'empathetic',
          },
        }),
      ],
    ]);

    Object.defineProperty(global, 'window', {
      configurable: true,
      value: {
        location: {
          href: 'http://localhost:3000/',
        },
        history: {
          replaceState: jest.fn(),
        },
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            storage.set(key, value);
          },
        },
      },
    });

    useAuthStore.getState().setToken('tok', {
      id: 'user-1',
      name: 'Maria',
      email: 'maria@test.com',
      goal: 'gain_muscle',
      coachPersonality: 'scientific',
    });

    expect(useAuthStore.getState().profilePreferences).toEqual({
      goal: 'gain_muscle',
      coachPersonality: 'scientific',
    });
  });
});
