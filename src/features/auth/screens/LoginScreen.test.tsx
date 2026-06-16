import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { LoginScreen } from './LoginScreen';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('@shared/services/auth.service', () => ({
  authService: {
    login: jest.fn().mockResolvedValue({
      token: 'tok',
      user: { id: '1', name: 'João', email: 'joao@test.com' },
    }),
  },
}));
jest.mock('@features/auth/store', () => ({
  useAuthStore: (sel: (s: { setToken: jest.Mock }) => unknown) =>
    sel({ setToken: jest.fn() }),
}));

describe('LoginScreen', () => {
  it('renderiza os campos de email e senha', () => {
    const { getByPlaceholderText } = render(
      <LoginScreen navigation={{ navigate: mockNavigate } as never} route={{} as never} />,
    );
    expect(getByPlaceholderText('seu@email.com')).toBeTruthy();
    expect(getByPlaceholderText('Sua senha')).toBeTruthy();
  });

  it('exibe link de recuperar senha', () => {
    const { getByText } = render(
      <LoginScreen navigation={{ navigate: mockNavigate } as never} route={{} as never} />,
    );
    expect(getByText('Esqueci minha senha')).toBeTruthy();
  });

  it('navega para ForgotPassword ao clicar no link', () => {
    const { getByText } = render(
      <LoginScreen navigation={{ navigate: mockNavigate } as never} route={{} as never} />,
    );
    fireEvent.press(getByText('Esqueci minha senha'));
    expect(mockNavigate).toHaveBeenCalledWith('ForgotPassword');
  });
});
