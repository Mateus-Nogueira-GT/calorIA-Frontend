import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { RootNavigator } from './RootNavigator';
import { useAuthStore } from '@features/auth/store';
import { profileService } from '@shared/services/profile.service';

jest.mock('@shared/services/profile.service', () => ({
  ...jest.requireActual('@shared/services/profile.service'),
  profileService: { getMe: jest.fn() },
}));
jest.mock('@shared/services/diet.service', () => ({
  dietService: { getActiveJob: jest.fn().mockResolvedValue(null) },
}));

const mockGetMe = profileService.getMe as jest.MockedFunction<typeof profileService.getMe>;

const perfil = (over: Record<string, unknown> = {}) =>
  ({
    id: 'u1',
    username: null,
    full_name: 'Rafael',
    avatar_url: null,
    avatar_emoji: null,
    current_streak: 0,
    height_cm: 180,
    weight_kg: 80,
    goal: 'lose_weight',
    ...over,
  }) as never;

function autenticado(profileComplete: boolean | null) {
  useAuthStore.setState({
    token: 'tok',
    refreshToken: 'r',
    user: { id: 'u1', name: 'Rafael', email: 'r@t.com' },
    isAuthenticated: true,
    pendingAuth: null,
    hasHydrated: true,
    profileComplete,
  });
}

/**
 * R6: o RootNavigator decidia a árvore só por `isAuthenticated`. Quem travava
 * no ProfileSetup, fechava o app e depois fazia LOGIN entrava direto no
 * dashboard — sem altura, peso nem objetivo, e portanto sem dieta possível.
 */
describe('RootNavigator — gate de perfil incompleto (R6)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('perfil completo entra no app', async () => {
    autenticado(true);
    mockGetMe.mockResolvedValue(perfil());
    const { queryByText } = render(<RootNavigator />);
    await waitFor(() => expect(mockGetMe).not.toHaveBeenCalled());
    expect(queryByText(/como você gostaria de ser chamado/i)).toBeNull();
  });

  it('perfil incompleto volta para o onboarding', async () => {
    autenticado(null);
    mockGetMe.mockResolvedValue(perfil({ height_cm: null, weight_kg: null, goal: null }));
    const { findByText } = render(<RootNavigator />);
    expect(await findByText(/como você gostaria de ser chamado/i)).toBeTruthy();
  });

  it('falha de rede na checagem NÃO prende o usuário fora do app', async () => {
    autenticado(null);
    mockGetMe.mockRejectedValue(new Error('offline'));
    const { queryByText } = render(<RootNavigator />);
    await waitFor(() => expect(useAuthStore.getState().profileComplete).toBe(true));
    expect(queryByText(/como você gostaria de ser chamado/i)).toBeNull();
  });

  it('não refaz a checagem quando já sabe a resposta', async () => {
    autenticado(true);
    mockGetMe.mockResolvedValue(perfil());
    render(<RootNavigator />);
    await waitFor(() => expect(useAuthStore.getState().profileComplete).toBe(true));
    expect(mockGetMe).not.toHaveBeenCalled();
  });
});
