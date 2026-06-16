import React from 'react';
import { render } from '@testing-library/react-native';
import { ProfileScreen } from './ProfileScreen';
import { useAuthStore } from '@features/auth/store';

jest.mock('@shared/services/food-log.service', () => ({
  foodLogService: { getMeals: jest.fn().mockResolvedValue([]) },
}));
jest.mock('@shared/services/auth.service', () => ({
  authService: { logout: jest.fn().mockResolvedValue({}) },
}));

beforeEach(() => {
  useAuthStore.setState({ token: 'tok', user: { id: '1', name: 'Maria', email: 'm@m.com' }, isAuthenticated: true, pendingAuth: null });
});

describe('ProfileScreen', () => {
  it('renderiza o nome do usuário', async () => {
    const { findByText } = render(<ProfileScreen />);
    expect(await findByText('Maria')).toBeTruthy();
  });

  it('renderiza o botão de sair', async () => {
    const { findByTestId } = render(<ProfileScreen />);
    expect(await findByTestId('logout-btn')).toBeTruthy();
  });
});
