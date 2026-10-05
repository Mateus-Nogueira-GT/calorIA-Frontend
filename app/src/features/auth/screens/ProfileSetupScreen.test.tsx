import React from 'react';
import { Alert, FlatList } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { OnboardingOptionCard } from '../components/OnboardingOptionCard';
import { findInvalidStep, matchOption, ProfileSetupScreen, validateStep } from './ProfileSetupScreen';

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
    bodyTypeQuiz,
    typedSex,
  }: {
    height?: string;
    weight?: string;
    sex?: string;
    age?: string;
    activity?: string;
    /** Respostas do "Ajude-me a descobrir"; sem elas, escolhe o biotipo direto. */
    bodyTypeQuiz?: string[];
    /** Digita o sexo no campo de texto em vez de tocar na opção. */
    typedSex?: string;
  } = {},
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
  if (typedSex) await answer(typedSex, 3);
  else await choose(sex, 3);
  await answer(age, 4);
  if (bodyTypeQuiz) {
    fireEvent.press(getByText('Ajude-me a descobrir'));
    for (const option of bodyTypeQuiz) {
      fireEvent.press(await findByText(option));
    }
    await findByText('5 / 10');
  } else {
    await choose('Magro / Acelerado (Ectomorfo)', 5);
  }
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
  fireEvent.press(getByText('Magro / Acelerado (Ectomorfo)'));
  await findByText(/qual é a sua altura/i);
}

/** Leva até a pergunta do biotipo (passo 4 de 10). */
async function goToBodyType(utils: ReturnType<typeof render>) {
  const { getByPlaceholderText, getByTestId, getByText, findByText } = utils;
  fireEvent.changeText(getByPlaceholderText('Digite aqui...'), 'João');
  fireEvent.press(getByTestId('send-btn'));
  await findByText(/qual é o seu sexo/i);
  fireEvent.press(getByText('Masculino'));
  await findByText(/quantos anos você tem/i);
  fireEvent.changeText(getByPlaceholderText('Digite aqui...'), '30');
  fireEvent.press(getByTestId('send-btn'));
  await findByText(/qual é o seu biotipo/i);
}

/** Mensagens da conversa, lidas dos dados do FlatList (nem todas renderizam no teste). */
function chatData(utils: ReturnType<typeof render>) {
  return utils.UNSAFE_getByType(FlatList).props.data as { id: string; role: string; text: string }[];
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

  describe('biotipo em linguagem leiga e "Ajude-me a descobrir"', () => {
    it('mostra os biotipos em linguagem leiga e a opção de descobrir', async () => {
      const utils = render(<ProfileSetupScreen navigation={{} as never} route={{} as never} />);
      await goToBodyType(utils);

      for (const title of [
        'Magro / Acelerado (Ectomorfo)',
        'Atlético / Versátil (Mesomorfo)',
        'Largo (Endomorfo)',
        'Ajude-me a descobrir',
      ]) {
        expect(utils.getByText(title)).toBeTruthy();
      }
      expect(utils.queryByText('Não sei')).toBeNull();
    });

    it('o mentor faz as perguntas, conclui o biotipo e segue para a altura', async () => {
      const utils = render(<ProfileSetupScreen navigation={{} as never} route={{} as never} />);
      const { getByText, findByText, queryByText, queryByPlaceholderText } = utils;
      await goToBodyType(utils);

      fireEvent.press(getByText('Ajude-me a descobrir'));
      await waitFor(() => expect(lastCoachMessage(utils)).toMatch(/envolva o pulso/i));
      expect(getByText('Os dedos se sobrepõem')).toBeTruthy();
      expect(getByText('Os dedos só se encostam')).toBeTruthy();
      expect(getByText('Os dedos não se encostam')).toBeTruthy();
      // As cards do biotipo saem de cena e a resposta é só por card.
      expect(queryByText('Largo (Endomorfo)')).toBeNull();
      expect(queryByPlaceholderText('Digite aqui...')).toBeNull();
      // Sub-perguntas não contam no progresso.
      expect(getByText('4 / 10')).toBeTruthy();

      fireEvent.press(getByText('Os dedos se sobrepõem'));
      await waitFor(() => expect(lastCoachMessage(utils)).toMatch(/seu peso costuma reagir/i));
      expect(getByText('4 / 10')).toBeTruthy();

      fireEvent.press(getByText('Quase não muda'));
      await waitFor(() => expect(lastCoachMessage(utils)).toMatch(/combina mais com o seu corpo/i));
      expect(getByText('4 / 10')).toBeTruthy();

      fireEvent.press(getByText('Atlético'));
      await findByText('5 / 10');

      const data = chatData(utils);
      const coachTexts = data.filter((m) => m.role === 'coach').map((m) => m.text);
      expect(coachTexts).toContain(
        'Pelo que você me contou, seu biotipo é Magro / Acelerado (Ectomorfo).',
      );
      expect(lastCoachMessage(utils)).toMatch(/qual é a sua altura/i);
      expect(data.filter((m) => m.role === 'user').map((m) => m.text)).toEqual([
        'João',
        'Masculino',
        '30',
        'Ajude-me a descobrir',
        'Os dedos se sobrepõem',
        'Quase não muda',
        'Atlético',
      ]);
      const ids = data.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(queryByPlaceholderText('Digite aqui...')).toBeTruthy();
    });

    it('envia o biotipo descoberto, nunca "discover"', async () => {
      await completeOnboarding(
        render(<ProfileSetupScreen navigation={{} as never} route={{} as never} />),
        { bodyTypeQuiz: ['Os dedos se sobrepõem', 'Quase não muda', 'Atlético'] },
      );

      await waitFor(() => expect(mockProfileSetup).toHaveBeenCalled());
      expect(mockProfileSetup.mock.calls[0]![0]).toMatchObject({ bodyType: 'ectomorph' });
    });

    it('empate nas respostas conclui mesomorfo e o onboarding continua', async () => {
      await completeOnboarding(
        render(<ProfileSetupScreen navigation={{} as never} route={{} as never} />),
        { bodyTypeQuiz: ['Os dedos se sobrepõem', 'Muda um pouco', 'Mais largo e arredondado'] },
      );

      await waitFor(() => expect(mockProfileSetup).toHaveBeenCalled());
      expect(mockProfileSetup.mock.calls[0]![0]).toMatchObject({ bodyType: 'mesomorph' });
    });

    it('escolher o biotipo direto envia o valor e mostra o rótulo leigo', async () => {
      const utils = render(<ProfileSetupScreen navigation={{} as never} route={{} as never} />);
      await completeOnboarding(utils);

      await waitFor(() => expect(mockProfileSetup).toHaveBeenCalled());
      expect(mockProfileSetup.mock.calls[0]![0]).toMatchObject({ bodyType: 'ectomorph' });
      expect(chatData(utils).find((m) => m.id === 'user-bodyType')?.text).toBe(
        'Magro / Acelerado (Ectomorfo)',
      );
    });
  });
  /**
   * Revisão final: passos de opção aceitavam qualquer texto digitado, e um
   * toque duplo pulava um passo. Os dois montavam um payload que o backend
   * sempre recusa, e o usuário novo ficava preso no cadastro.
   */
  describe('o onboarding nunca envia um payload que o backend recusa', () => {
    const typeAnswer = (utils: ReturnType<typeof render>, text: string) => {
      fireEvent.changeText(utils.getByPlaceholderText('Digite aqui...'), text);
      fireEvent.press(utils.getByTestId('send-btn'));
    };
    /**
     * Toque duplo real: os dois toques chegam antes do re-render, então os dois
     * rodam com o mesmo closure (o do passo que ainda está na tela). Um
     * fireEvent.press de cada vez não reproduz: entre um e outro o React já
     * re-renderizou e o card antigo saiu da árvore.
     */
    const doubleTap = (utils: ReturnType<typeof render>, title: string) => {
      const card = utils
        .UNSAFE_getAllByType(OnboardingOptionCard)
        .find((c) => c.props.title === title)!;
      act(() => {
        card.props.onPress();
        card.props.onPress();
      });
    };
    async function goToSex(utils: ReturnType<typeof render>) {
      typeAnswer(utils, 'João');
      await utils.findByText('2 / 10');
    }

    it('digitar "masculino" no passo do sexo avança e envia sex "male"', async () => {
      await completeOnboarding(
        render(<ProfileSetupScreen navigation={{} as never} route={{} as never} />),
        { typedSex: 'masculino' },
      );

      await waitFor(() => expect(mockProfileSetup).toHaveBeenCalled());
      expect(mockProfileSetup.mock.calls[0]![0]).toMatchObject({ sex: 'male' });
    });

    it.each([
      ['Homem', 'male'],
      ['  FEMININO ', 'female'],
      ['mulher', 'female'],
      ['f', 'female'],
    ])('digitar "%s" no passo do sexo vira %s', async (typed, expected) => {
      await completeOnboarding(
        render(<ProfileSetupScreen navigation={{} as never} route={{} as never} />),
        { typedSex: typed },
      );

      await waitFor(() => expect(mockProfileSetup).toHaveBeenCalled());
      expect(mockProfileSetup.mock.calls[0]![0]).toMatchObject({ sex: expected });
    });

    it('texto que não é uma opção ("banana") repergunta e não avança', async () => {
      const utils = render(<ProfileSetupScreen navigation={{} as never} route={{} as never} />);
      await goToSex(utils);

      typeAnswer(utils, 'banana');

      await waitFor(() => expect(lastCoachMessage(utils)).toBe('Toque em uma das opções acima 🙂'));
      expect(utils.getByText('2 / 10')).toBeTruthy();
      // As opções continuam na tela para o usuário tocar.
      expect(utils.getByText('Masculino')).toBeTruthy();
    });

    it('toque duplo numa opção do sexo não pula a idade', async () => {
      const utils = render(<ProfileSetupScreen navigation={{} as never} route={{} as never} />);
      await goToSex(utils);

      doubleTap(utils, 'Masculino');

      await utils.findByText('3 / 10');
      expect(lastCoachMessage(utils)).toMatch(/quantos anos você tem/i);
      expect(utils.queryByText('4 / 10')).toBeNull();
      expect(chatData(utils).filter((m) => m.id === 'user-sex')).toHaveLength(1);
    });

    it('toque duplo na última opção do quiz não pula a altura', async () => {
      const utils = render(<ProfileSetupScreen navigation={{} as never} route={{} as never} />);
      await goToBodyType(utils);

      fireEvent.press(utils.getByText('Ajude-me a descobrir'));
      fireEvent.press(await utils.findByText('Os dedos se sobrepõem'));
      fireEvent.press(await utils.findByText('Quase não muda'));
      await utils.findByText('Atlético');
      doubleTap(utils, 'Atlético');

      await utils.findByText('5 / 10');
      expect(lastCoachMessage(utils)).toMatch(/qual é a sua altura/i);
      expect(utils.queryByText('6 / 10')).toBeNull();
      const ids = chatData(utils).map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('digitar "discover" no biotipo não abre o quiz — repergunta', async () => {
      const utils = render(<ProfileSetupScreen navigation={{} as never} route={{} as never} />);
      await goToBodyType(utils);

      typeAnswer(utils, 'discover');

      await waitFor(() => expect(lastCoachMessage(utils)).toBe('Toque em uma das opções acima 🙂'));
      expect(utils.getByText('4 / 10')).toBeTruthy();
      expect(utils.queryByText('Os dedos se sobrepõem')).toBeNull();
    });

    it('digitar "não sei" no biotipo abre o quiz do mentor', async () => {
      const utils = render(<ProfileSetupScreen navigation={{} as never} route={{} as never} />);
      await goToBodyType(utils);

      typeAnswer(utils, 'não sei');

      await waitFor(() => expect(lastCoachMessage(utils)).toMatch(/envolva o pulso/i));
      expect(utils.getByText('4 / 10')).toBeTruthy();
    });

    it('digitar "atlético" no biotipo vira mesomorph', async () => {
      const utils = render(<ProfileSetupScreen navigation={{} as never} route={{} as never} />);
      await goToBodyType(utils);

      typeAnswer(utils, 'atlético');

      await utils.findByText('5 / 10');
      expect(lastCoachMessage(utils)).toMatch(/qual é a sua altura/i);
      // A bolha mostra o rótulo da opção reconhecida, não o texto cru.
      expect(chatData(utils).find((m) => m.id === 'user-bodyType')?.text).toBe(
        'Atlético / Versátil (Mesomorfo)',
      );
    });

    it.each([
      ['activity', 'sedentario', 'sedentary'],
      ['activity', 'Muito ativo', 'very_active'],
      ['activity', 'ativo', 'active'],
      ['goal', 'perder', 'lose_weight'],
      ['goal', 'maintain', 'maintain'],
      ['bodyType', 'magro', 'ectomorph'],
      ['bodyType', 'Largo', 'endomorph'],
      ['bodyType', 'endomorfo', 'endomorph'],
      ['bodyType', 'quero descobrir', 'discover'],
      ['personality', 'científico', 'scientific'],
      ['gender', 'neutro', 'neutral'],
    ])('matchOption(%s, "%s") → %s', (step, typed, value) => {
      expect(matchOption(step as never, typed)?.value).toBe(value);
    });

    it.each([
      ['goal', 'peso'], // ambíguo: perder ou manter
      ['bodyType', 'discover'],
      ['sex', 'x'],
      ['activity', 'banana'],
      ['name', 'João'], // passo sem opções
    ])('matchOption(%s, "%s") não casa', (step, typed) => {
      expect(matchOption(step as never, typed)).toBeNull();
    });

    describe('findInvalidStep (rede de segurança antes de enviar)', () => {
      const valid = {
        name: 'João',
        sex: 'male',
        age: '30',
        bodyType: 'ectomorph',
        height: '180',
        weight: '80',
        activity: 'light',
        goal: 'lose_weight',
        personality: 'motivational',
        gender: 'neutral',
      } as const;

      it('respostas completas e válidas passam', () => {
        expect(findInvalidStep({ ...valid })).toBeNull();
      });

      it('biotipo ausente não bloqueia (vira "unknown")', () => {
        expect(findInvalidStep({ ...valid, bodyType: undefined })).toBeNull();
      });

      it.each([
        ['sex', { sex: 'banana' }],
        ['sex', { sex: undefined }],
        ['age', { age: '200' }],
        ['age', { age: undefined }],
        ['name', { name: '' }],
        ['height', { height: undefined }],
        ['weight', { weight: 'abc' }],
        ['activity', { activity: 'Leve' }],
        ['goal', { goal: undefined }],
        ['personality', { personality: 'discover' }],
        ['gender', { gender: 'other' }],
      ])('aponta o passo %s quando %o', (step, patch) => {
        expect(findInvalidStep({ ...valid, ...patch })).toBe(step);
      });
    });
  });
});
