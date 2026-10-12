import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { WelcomeScreen } from './WelcomeScreen';

const mockNavigate = jest.fn();

describe('WelcomeScreen', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('preserva a navegacao para cadastro', () => {
    const { getByText } = render(
      <WelcomeScreen navigation={{ navigate: mockNavigate } as never} route={{} as never} />,
    );

    fireEvent.press(getByText('Criar conta'));

    expect(mockNavigate).toHaveBeenCalledWith('Register');
  });

  it('preserva a navegacao para login', () => {
    const { getByText } = render(
      <WelcomeScreen navigation={{ navigate: mockNavigate } as never} route={{} as never} />,
    );

    fireEvent.press(getByText('Já tenho conta'));

    expect(mockNavigate).toHaveBeenCalledWith('Login');
  });

  it('abre o scanner sem exigir conta (App Store 5.1.1(v))', () => {
    const { getByText } = render(
      <WelcomeScreen navigation={{ navigate: mockNavigate } as never} route={{} as never} />,
    );

    fireEvent.press(getByText('Escanear um prato sem conta'));

    expect(mockNavigate).toHaveBeenCalledWith('GuestScanner');
  });
});
