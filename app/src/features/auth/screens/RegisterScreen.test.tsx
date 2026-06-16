import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { RegisterScreen } from './RegisterScreen';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('@shared/services/auth.service', () => ({
  authService: {
    register: jest.fn().mockResolvedValue({
      token: 'tok',
      user: { id: '1', name: 'João', email: 'joao@test.com' },
    }),
  },
}));
jest.mock('@features/auth/store', () => ({
  useAuthStore: (sel: (s: { setPendingAuth: jest.Mock }) => unknown) =>
    sel({ setPendingAuth: jest.fn() }),
}));

describe('RegisterScreen', () => {
  it('renderiza os campos de nome, email e senha', () => {
    const { getByPlaceholderText } = render(
      <RegisterScreen navigation={{ navigate: mockNavigate } as never} route={{} as never} />,
    );
    expect(getByPlaceholderText('Seu nome completo')).toBeTruthy();
    expect(getByPlaceholderText('seu@email.com')).toBeTruthy();
    expect(getByPlaceholderText('Mínimo 8 caracteres')).toBeTruthy();
  });

  it('exibe erro de validação se nome tiver menos de 2 caracteres', async () => {
    const { getByPlaceholderText, getByText } = render(
      <RegisterScreen navigation={{ navigate: mockNavigate } as never} route={{} as never} />,
    );
    fireEvent.changeText(getByPlaceholderText('Seu nome completo'), 'A');
    fireEvent(getByPlaceholderText('Seu nome completo'), 'blur');
    await waitFor(() => expect(getByText('Nome deve ter no mínimo 2 caracteres')).toBeTruthy());
  });

  it('exibe erro de validação para email inválido', async () => {
    const { getByPlaceholderText, getByText } = render(
      <RegisterScreen navigation={{ navigate: mockNavigate } as never} route={{} as never} />,
    );
    fireEvent.changeText(getByPlaceholderText('seu@email.com'), 'nao-e-email');
    fireEvent(getByPlaceholderText('seu@email.com'), 'blur');
    await waitFor(() => expect(getByText('E-mail inválido')).toBeTruthy());
  });
});
