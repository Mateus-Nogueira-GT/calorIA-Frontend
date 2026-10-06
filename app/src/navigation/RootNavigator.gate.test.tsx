import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { RootNavigator } from './RootNavigator';
import { useAuthStore } from '@features/auth/store';
import { profileService } from '@shared/services/profile.service';
import { dietService } from '@shared/services/diet.service';
import { useCoachStore } from '@features/coach/store';

jest.mock('@shared/services/profile.service', () => ({
  ...jest.requireActual('@shared/services/profile.service'),
  profileService: { getMe: jest.fn() },
}));
jest.mock('@shared/services/diet.service', () => ({
  dietService: {
    getActiveJob: jest.fn().mockResolvedValue(null),
    stepJob: jest.fn(),
    retryJob: jest.fn(),
  },
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

describe('RootNavigator — retomada da geração no boot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useCoachStore.getState().resetDietGeneration();
  });

  it('job failed no boot mostra a falha com a mensagem e não liga o polling', async () => {
    autenticado(true);
    (dietService.getActiveJob as jest.Mock).mockResolvedValueOnce({
      jobId: 'j1',
      status: 'failed',
      daysCompleted: 4,
      totalDays: 7,
      dietId: 'd1',
      error: 'STEP_TIMEOUT',
      errorCode: 'STEP_TIMEOUT',
      errorMessage: 'A geração parou de responder.',
    });
    render(<RootNavigator />);
    await waitFor(() =>
      expect(useCoachStore.getState().dietJob).toMatchObject({
        status: 'failed',
        daysCompleted: 4,
        errorMessage: 'A geração parou de responder.',
      }),
    );
    expect(useCoachStore.getState().activeJobId).toBe('j1');
    expect(dietService.stepJob).not.toHaveBeenCalled();
    expect(dietService.retryJob).not.toHaveBeenCalled();
  });

  it('job failed STALE no boot (app ficou fechado) reabre sozinho e retoma a geração', async () => {
    autenticado(true);
    (dietService.getActiveJob as jest.Mock).mockResolvedValueOnce({
      jobId: 'j1',
      status: 'failed',
      daysCompleted: 4,
      totalDays: 7,
      dietId: 'd1',
      error: 'STALE',
      errorCode: 'STALE',
      errorMessage: 'A geração parou de responder.',
    });
    (dietService.retryJob as jest.Mock).mockResolvedValueOnce({
      jobId: 'j1',
      status: 'running',
      daysCompleted: 4,
      totalDays: 7,
      dietId: 'd1',
      error: null,
    });
    (dietService.stepJob as jest.Mock).mockResolvedValue({
      jobId: 'j1',
      status: 'completed',
      daysCompleted: 7,
      totalDays: 7,
      dietId: 'd1',
      error: null,
    });
    render(<RootNavigator />);
    await waitFor(() => expect(useCoachStore.getState().dietJob?.status).toBe('completed'));
    expect(dietService.retryJob).toHaveBeenCalledTimes(1);
    expect(dietService.retryJob).toHaveBeenCalledWith('j1');
    expect(dietService.stepJob).toHaveBeenCalledWith('j1');
  });
});
