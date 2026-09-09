import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ProfileScreen } from './ProfileScreen';
import { useAuthStore } from '@features/auth/store';
import { Alert, Linking } from 'react-native';
import type { AlertButton } from 'react-native';
import { profileService } from '@shared/services/profile.service';

jest.mock('@shared/services/food-log.service', () => ({
  foodLogService: { getSummary: jest.fn().mockResolvedValue([]) },
}));
jest.mock('@shared/services/auth.service', () => ({
  authService: { logout: jest.fn().mockResolvedValue({}) },
}));
jest.mock('@shared/services/profile.service', () => ({
  profileService: { getMe: jest.fn().mockResolvedValue(null), deleteAccount: jest.fn() },
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

  it('oferece a exclusão de conta no menu', async () => {
    const navigation = { navigate: jest.fn() } as never;
    const { findByTestId } = render(<ProfileScreen navigation={navigation} route={{} as never} />);
    expect(await findByTestId('delete-account-btn')).toBeTruthy();
  });

  it('exige DUAS confirmações antes de excluir — um toque não apaga a conta', async () => {
    const spy = jest.spyOn(Alert, 'alert');
    const navigation = { navigate: jest.fn() } as never;
    const { findByTestId } = render(<ProfileScreen navigation={navigation} route={{} as never} />);

    fireEvent.press(await findByTestId('delete-account-btn'));

    // 1º diálogo: nada foi excluído ainda.
    expect(spy).toHaveBeenCalledWith('Excluir conta', expect.any(String), expect.any(Array));
    expect(profileService.deleteAccount).not.toHaveBeenCalled();

    // Avança para o 2º diálogo pelo botão "Continuar".
    const primeiro = spy.mock.calls[spy.mock.calls.length - 1][2] as AlertButton[];
    primeiro.find((b) => b.text === 'Continuar')?.onPress?.();
    expect(spy).toHaveBeenLastCalledWith('Tem certeza?', expect.any(String), expect.any(Array));
    expect(profileService.deleteAccount).not.toHaveBeenCalled();

    // Só a confirmação final dispara a chamada.
    const segundo = spy.mock.calls[spy.mock.calls.length - 1][2] as AlertButton[];
    segundo.find((b) => b.text === 'Excluir conta')?.onPress?.();
    expect(profileService.deleteAccount).toHaveBeenCalledTimes(1);

    spy.mockRestore();
  });

  it('abre a política de privacidade no navegador', async () => {
    const spy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const navigation = { navigate: jest.fn() } as never;
    const { findByTestId } = render(<ProfileScreen navigation={navigation} route={{} as never} />);

    fireEvent.press(await findByTestId('privacy-policy-btn'));

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('politica-de-privacidade'));
    spy.mockRestore();
  });
  /**
   * AP1: a conta demo entregue à App Review é protegida no servidor. Sem esta
   * mensagem o revisor veria "tente novamente em instantes" e insistiria.
   */
  it('conta de demonstração mostra a mensagem certa, não o erro genérico', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (profileService.deleteAccount as jest.Mock).mockRejectedValueOnce({
      response: {
        status: 403,
        data: {
          error: 'DEMO_ACCOUNT_PROTECTED',
          message: 'Esta é uma conta de demonstração e não pode ser excluída.',
        },
      },
    });

    const { findByTestId } = render(
      <ProfileScreen navigation={{ navigate: jest.fn() } as never} route={{} as never} />,
    );
    fireEvent.press(await findByTestId('delete-account-btn'));

    // A exclusão exige DOIS diálogos (ver o teste acima).
    const primeiro = alertSpy.mock.calls.at(-1)![2] as AlertButton[];
    primeiro.find((b) => b.text === 'Continuar')?.onPress?.();
    const segundo = alertSpy.mock.calls.at(-1)![2] as AlertButton[];
    segundo.find((b) => b.text === 'Excluir conta')?.onPress?.();

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Conta de demonstração',
        expect.stringContaining('não pode ser excluída'),
      ),
    );
    alertSpy.mockRestore();
  });
});
