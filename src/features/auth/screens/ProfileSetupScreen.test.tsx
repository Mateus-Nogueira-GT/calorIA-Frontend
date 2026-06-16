import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ProfileSetupScreen } from './ProfileSetupScreen';

jest.mock('@shared/services/auth.service', () => ({
  authService: { profileSetup: jest.fn().mockResolvedValue({ success: true }) },
}));
jest.mock('@features/auth/store', () => ({
  useAuthStore: (sel: (s: {
    setToken: jest.Mock;
    pendingAuth: { token: string; user: { id: string; name: string; email: string } };
    user: { id: string; name: string; email: string };
  }) => unknown) =>
    sel({
      setToken: jest.fn(),
      pendingAuth: { token: 'tok', user: { id: '1', name: 'João', email: 'j@t.com' } },
      user: { id: '1', name: 'João', email: 'j@t.com' },
    }),
}));

describe('ProfileSetupScreen', () => {
  it('exibe a primeira pergunta do coach ao montar', () => {
    const { getByText } = render(
      <ProfileSetupScreen navigation={{} as never} route={{} as never} />,
    );
    expect(getByText(/como você gostaria de ser chamado/i)).toBeTruthy();
  });

  it('exibe o progress bar iniciando em 1/7', () => {
    const { getByText } = render(
      <ProfileSetupScreen navigation={{} as never} route={{} as never} />,
    );
    expect(getByText('1 / 7')).toBeTruthy();
  });

  it('avança para a segunda pergunta após responder a primeira via input', async () => {
    const { getByPlaceholderText, getByTestId, getByText } = render(
      <ProfileSetupScreen navigation={{} as never} route={{} as never} />,
    );
    const input = getByPlaceholderText('Digite aqui...');
    fireEvent.changeText(input, 'João');
    fireEvent.press(getByTestId('send-btn'));
    await waitFor(() => expect(getByText('2 / 7')).toBeTruthy());
  });
});
