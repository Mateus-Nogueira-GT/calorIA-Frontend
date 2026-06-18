import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ProfileScreen } from './ProfileScreen';
import { useAuthStore } from '@features/auth/store';

jest.mock('@shared/services/food-log.service', () => ({
  foodLogService: { getMeals: jest.fn().mockResolvedValue([]) },
}));
jest.mock('@shared/services/auth.service', () => ({
  authService: { logout: jest.fn().mockResolvedValue({}) },
}));

beforeEach(() => {
  useAuthStore.setState({
    token: 'tok',
    user: { id: '1', name: 'Maria', email: 'm@m.com' },
    isAuthenticated: true,
    pendingAuth: null,
    profilePreferences: {
      goal: null,
      coachPersonality: null,
    },
  });
});

describe('ProfileScreen', () => {
  it('renderiza o nome do usuário', async () => {
    const navigation = { navigate: jest.fn() } as never;
    const { findByText } = render(<ProfileScreen navigation={navigation} route={{} as never} />);
    expect(await findByText('Maria')).toBeTruthy();
  });

  it('renderiza o botão de sair', async () => {
    const navigation = { navigate: jest.fn() } as never;
    const { findByTestId } = render(<ProfileScreen navigation={navigation} route={{} as never} />);
    expect(await findByTestId('logout-btn')).toBeTruthy();
  });

  it('navega para a tela de metas e objetivos', async () => {
    const navigate = jest.fn();
    const { findByTestId } = render(
      <ProfileScreen navigation={{ navigate } as never} route={{} as never} />,
    );

    fireEvent.press(await findByTestId('profile-goals-btn'));
    expect(navigate).toHaveBeenCalledWith('ProfileGoals');
  });

  it('navega para a tela de personalidade do coach', async () => {
    const navigate = jest.fn();
    const { findByTestId } = render(
      <ProfileScreen navigation={{ navigate } as never} route={{} as never} />,
    );

    fireEvent.press(await findByTestId('profile-coach-personality-btn'));
    expect(navigate).toHaveBeenCalledWith('ProfileCoachPersonality');
  });
});
