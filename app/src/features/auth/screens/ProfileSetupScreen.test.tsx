import React from 'react';
import { Alert, FlatList } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ProfileSetupScreen, validateStep } from './ProfileSetupScreen';

const mockProfileSetup = jest.fn().mockResolvedValue({ success: true });
const mockSetToken = jest.fn();
const mockSetProfilePreferences = jest.fn();
const mockSetProfileComplete = jest.fn();
const pendingAuth = {
  token: 'tok',
  refreshToken: 'refresh-tok',
  user: { id: '1', name: 'João', email: 'j@t.com' },
};

jest.mock('@shared/services/auth.service', () => ({
  authService: { profileSetup: (...args: unknown[]) => mockProfileSetup(...args) },
}));
jest.mock('@features/auth/store', () => ({
  useAuthStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      setToken: mockSetToken,
      setProfilePreferences: mockSetProfilePreferences,
      setProfileComplete: mockSetProfileComplete,
      pendingAuth,
      user: pendingAuth.user,
    }),
}));

/** Percorre os 10 passos do onboarding até disparar o envio do perfil. */
async function completeOnboarding(
  utils: ReturnType<typeof render>,
  {
    height = '180',
    weight = '80',
    sex = 'Masculino',
    age = '30',
    activity = 'Leve',
  }: { height?: string; weight?: string; sex?: string; age?: string; activity?: string } = {},
) {
  const { getByPlaceholderText, getByTestId, getByText, findByText } = utils;
  // Espera pelo contador e não pela pergunta: no teste o FlatList só
  // renderiza as primeiras bolhas, e com 10 passos as últimas ficam de fora.
  const answer = async (value: string, nextStep: number) => {
    fireEvent.changeText(getByPlaceholderText('Digite aqui...'), value);
    fireEvent.press(getByTestId('send-btn'));
    await findByText(`${nextStep} / 10`);
  };
  const choose = async (title: string, nextStep: number) => {
    fireEvent.press(getByText(title));
    await findByText(`${nextStep} / 10`);
  };

  await answer('João', 2);
  expect(getByText(/qual é o seu sexo/i)).toBeTruthy();
  await choose(sex, 3);
  await answer(age, 4);
  await choose('Ectomorfo', 5);
  await answer(height, 6);
  await answer(weight, 7);
  await choose(activity, 8);
  await choose('Perder peso', 9);
  await choose('Motivador', 10);
  fireEvent.press(getByText('Neutro'));
}

/**
 * Última fala do Coach, lida dos dados do FlatList: no teste ele só renderiza
 * as primeiras bolhas, e a repergunta da altura já fica além delas.
 */
function lastCoachMessage(utils: ReturnType<typeof render>): string {
  const data = utils.UNSAFE_getByType(FlatList).props.data as { role: string; text: string }[];
  return data.filter((m) => m.role === 'coach').at(-1)!.text;
}

/** Leva até a pergunta da altura (passo 5 de 10). */
async function goToHeight(utils: ReturnType<typeof render>) {
  const { getByPlaceholderText, getByTestId, getByText, findByText } = utils;
  fireEvent.changeText(getByPlaceholderText('Digite aqui...'), 'João');
  fireEvent.press(getByTestId('send-btn'));
  await findByText(/qual é o seu sexo/i);
  fireEvent.press(getByText('Masculino'));
  await findByText(/quantos anos você tem/i);
  fireEvent.changeText(getByPlaceholderText('Digite aqui...'), '30');
  fireEvent.press(getByTestId('send-btn'));
  await findByText(/qual é o seu biotipo/i);
  fireEvent.press(getByText('Ectomorfo'));
  await findByText(/qual é a sua altura/i);
}

describe('ProfileSetupScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProfileSetup.mockResolvedValue({ success: true });
  });

  it('exibe a primeira pergunta do coach ao montar', () => {
    const { getByText } = render(
      <ProfileSetupScreen navigation={{} as never} route={{} as never} />,
    );
    expect(getByText(/como você gostaria de ser chamado/i)).toBeTruthy();
  });

  it('exibe o progress bar iniciando em 1/10', () => {
    const { getByText } = render(
      <ProfileSetupScreen navigation={{} as never} route={{} as never} />,
    );
    expect(getByText('1 / 10')).toBeTruthy();
  });

  it('avança para a segunda pergunta após responder a primeira via input', async () => {
    const { getByPlaceholderText, getByTestId, getByText } = render(
      <ProfileSetupScreen navigation={{} as never} route={{} as never} />,
    );
    const input = getByPlaceholderText('Digite aqui...');
    fireEvent.changeText(input, 'João');
    fireEvent.press(getByTestId('send-btn'));
    await waitFor(() => expect(getByText('2 / 10')).toBeTruthy());
  });

  it('só autentica DEPOIS de o perfil ser salvo', async () => {
    const order: string[] = [];
    mockProfileSetup.mockImplementation(async () => {
      order.push('profileSetup');
      return { success: true };
    });
    mockSetToken.mockImplementation(() => order.push('setToken'));

    await completeOnboarding(
      render(<ProfileSetupScreen navigation={{} as never} route={{} as never} />),
    );

    await waitFor(() => expect(mockSetToken).toHaveBeenCalled());
    expect(order).toEqual(['profileSetup', 'setToken']);
  });

  /**
   * R1: o campo de texto do onboarding é um TextInput genérico, sem máscara e
   * sem validação. Um brasileiro digita a altura como "1,80"; `Number("1,80")`
   * é NaN e o JSON.stringify manda `null` ao backend, que rejeita
   * (`z.number().optional()` aceita undefined, não null). O usuário tomava
   * "Não foi possível salvar seu perfil" sem nenhuma pista do motivo, e
   * repetia o mesmo erro para sempre.
   */
  describe('R1 — validação de altura e peso', () => {
    it('aceita vírgula decimal e metros: "1,80" vira 180 cm', async () => {
      await completeOnboarding(
        render(<ProfileSetupScreen navigation={{} as never} route={{} as never} />),
        { height: '1,80', weight: '80,5' },
      );

      await waitFor(() => expect(mockProfileSetup).toHaveBeenCalled());
      const payload = mockProfileSetup.mock.calls[0]![0] as {
        heightCm: number;
        weightKg: number;
      };
      expect(payload.heightCm).toBe(180);
      expect(payload.weightKg).toBe(80.5);
    });

    it('aceita unidade junto do número: "180 cm" e "80 kg"', async () => {
      await completeOnboarding(
        render(<ProfileSetupScreen navigation={{} as never} route={{} as never} />),
        { height: '180 cm', weight: '80 kg' },
      );

      await waitFor(() => expect(mockProfileSetup).toHaveBeenCalled());
      const payload = mockProfileSetup.mock.calls[0]![0] as {
        heightCm: number;
        weightKg: number;
      };
      expect(payload.heightCm).toBe(180);
      expect(payload.weightKg).toBe(80);
    });

    it('nunca envia NaN nem null, aconteça o que acontecer', async () => {
      await completeOnboarding(
        render(<ProfileSetupScreen navigation={{} as never} route={{} as never} />),
        { height: '1,80', weight: '80,5' },
      );

      await waitFor(() => expect(mockProfileSetup).toHaveBeenCalled());
      const payload = mockProfileSetup.mock.calls[0]![0] as Record<string, unknown>;
      // JSON.stringify transforma NaN em null: é assim que o backend recebia.
      expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
      for (const [key, value] of Object.entries(payload)) {
        expect(`${key}=${String(value)}`).not.toContain('NaN');
        expect(value).not.toBeNull();
      }
    });

    it('resposta não numérica não avança o passo — o Coach repergunta', async () => {
      const utils = render(
        <ProfileSetupScreen navigation={{} as never} route={{} as never} />,
      );
      const { getByPlaceholderText, getByTestId, getByText } = utils;
      await goToHeight(utils);

      fireEvent.changeText(getByPlaceholderText('Digite aqui...'), 'um metro e oitenta');
      fireEvent.press(getByTestId('send-btn'));

      // Continua no passo 5 de 10 e explica o que fazer.
      await waitFor(() => expect(lastCoachMessage(utils)).toMatch(/não entendi a altura/i));
      expect(getByText('5 / 10')).toBeTruthy();
    });

    it('altura fora da faixa plausível é recusada', async () => {
      const utils = render(
        <ProfileSetupScreen navigation={{} as never} route={{} as never} />,
      );
      const { getByPlaceholderText, getByTestId, getByText } = utils;
      await goToHeight(utils);

      fireEvent.changeText(getByPlaceholderText('Digite aqui...'), '999');
      fireEvent.press(getByTestId('send-btn'));

      await waitFor(() => expect(lastCoachMessage(utils)).toMatch(/altura não parece certa/i));
      expect(getByText('5 / 10')).toBeTruthy();
    });
  });

  it('mostra a causa real quando o backend explica o erro', async () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockProfileSetup.mockRejectedValue({
      response: { data: { message: 'Altura deve ser um número' } },
    });

    await completeOnboarding(
      render(<ProfileSetupScreen navigation={{} as never} route={{} as never} />),
    );

    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls[0]![1]).toContain('Altura deve ser um número');
    spy.mockRestore();
  });

  it('marca o perfil como completo ao salvar (destrava o gate do R6)', async () => {
    await completeOnboarding(
      render(<ProfileSetupScreen navigation={{} as never} route={{} as never} />),
    );

    await waitFor(() => expect(mockSetProfileComplete).toHaveBeenCalledWith(true));
  });

  it('não marca o perfil como completo quando salvar falha', async () => {
    mockProfileSetup.mockRejectedValue(new Error('offline'));

    await completeOnboarding(
      render(<ProfileSetupScreen navigation={{} as never} route={{} as never} />),
    );

    await waitFor(() => expect(mockProfileSetup).toHaveBeenCalled());
    expect(mockSetProfileComplete).not.toHaveBeenCalled();
  });

  it('reenviar depois de uma falha não duplica a resposta na conversa', async () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockProfileSetup.mockRejectedValueOnce(new Error('offline'));
    const utils = render(<ProfileSetupScreen navigation={{} as never} route={{} as never} />);

    await completeOnboarding(utils);
    await waitFor(() => expect(spy).toHaveBeenCalled());

    // Toca de novo na última opção: é assim que o usuário reenvia.
    fireEvent.press(utils.getAllByText('Neutro').at(-1)!);
    await waitFor(() => expect(mockSetProfileComplete).toHaveBeenCalledWith(true));

    // Lê os dados do FlatList (ele só renderiza as primeiras bolhas no teste).
    // Antes a resposta entrava de novo com o mesmo id: bolha em dobro e chave
    // duplicada no keyExtractor.
    const data = utils.UNSAFE_getByType(FlatList).props.data as { id: string }[];
    const ids = data.map((m) => m.id);
    expect(ids.filter((id) => id === 'user-gender')).toHaveLength(1);
    expect(new Set(ids).size).toBe(ids.length);
    spy.mockRestore();
  });

  it('não autentica quando salvar o perfil falha', async () => {
    mockProfileSetup.mockRejectedValue(new Error('offline'));

    await completeOnboarding(
      render(<ProfileSetupScreen navigation={{} as never} route={{} as never} />),
    );

    await waitFor(() => expect(mockProfileSetup).toHaveBeenCalled());
    expect(mockSetToken).not.toHaveBeenCalled();
  });
  describe('sexo, idade e nível de atividade (o coach não repergunta)', () => {
    it('validateStep aceita idade inteira plausível', () => {
      expect(validateStep('age', '30')).toEqual({ ok: true, value: '30' });
      expect(validateStep('age', '30 anos')).toEqual({ ok: true, value: '30' });
    });

    it.each(['12', '101', 'abc'])('validateStep recusa idade "%s" com motivo amigável', (raw) => {
      const check = validateStep('age', raw);
      expect(check.ok).toBe(false);
      if (!check.ok) expect(check.reason).toMatch(/idade|anos/i);
    });

    it('idade inválida não avança o passo — o Coach repergunta', async () => {
      const utils = render(<ProfileSetupScreen navigation={{} as never} route={{} as never} />);
      const { getByPlaceholderText, getByTestId, getByText, findByText } = utils;

      fireEvent.changeText(getByPlaceholderText('Digite aqui...'), 'João');
      fireEvent.press(getByTestId('send-btn'));
      await findByText(/qual é o seu sexo/i);
      fireEvent.press(getByText('Feminino'));
      await findByText(/quantos anos você tem/i);

      fireEvent.changeText(getByPlaceholderText('Digite aqui...'), 'abc');
      fireEvent.press(getByTestId('send-btn'));

      await findByText(/não entendi a idade/i);
      expect(getByText('3 / 10')).toBeTruthy();
    });

    it('envia sexo, idade e nível de atividade escolhidos', async () => {
      await completeOnboarding(
        render(<ProfileSetupScreen navigation={{} as never} route={{} as never} />),
        { sex: 'Feminino', age: '30', activity: 'Moderado' },
      );

      await waitFor(() => expect(mockProfileSetup).toHaveBeenCalled());
      expect(mockProfileSetup.mock.calls[0]![0]).toMatchObject({
        sex: 'female',
        age: 30,
        activityLevel: 'moderate',
        coachGender: 'neutral',
      });
      await waitFor(() => expect(mockSetProfileComplete).toHaveBeenCalledWith(true));
    });
  });
});
