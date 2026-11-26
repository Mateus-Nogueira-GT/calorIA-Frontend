import { useCoachStore } from './store';
import { useFoodLogStore } from '@features/food-log/store';
import { useAuthStore } from '@features/auth/store';

// 05/11: o coach propõe a ação e só grava quando o usuário toca no cartão.

jest.mock('@shared/services/coach.service', () => ({
  coachService: { sendMessage: jest.fn() },
}));
jest.mock('@shared/services/food-log.service', () => ({
  foodLogService: { getMeals: jest.fn(), addMeal: jest.fn(), updateMeal: jest.fn() },
}));
jest.mock('@shared/services/weight.service', () => ({
  weightService: { addEntry: jest.fn(), getHistory: jest.fn().mockResolvedValue([]) },
}));
jest.mock('@features/diet/store', () => ({
  useDietStore: { getState: () => ({ loadCurrent: mockLoadCurrent }) },
}));
jest.mock('@shared/services/diet.service', () => ({
  dietService: {
    stepJob: jest.fn(),
    getJob: jest.fn(),
    retryJob: jest.fn(),
    toggleMeal: jest.fn(),
  },
}));
const mockLoadCurrent = jest.fn().mockResolvedValue(undefined);

const { coachService } = jest.requireMock('@shared/services/coach.service') as {
  coachService: { sendMessage: jest.Mock };
};
const { foodLogService } = jest.requireMock('@shared/services/food-log.service') as {
  foodLogService: { addMeal: jest.Mock };
};
const { weightService } = jest.requireMock('@shared/services/weight.service') as {
  weightService: { addEntry: jest.Mock; getHistory: jest.Mock };
};
const { dietService } = jest.requireMock('@shared/services/diet.service') as {
  dietService: { toggleMeal: jest.Mock };
};

const eggs = {
  kind: 'log_meal' as const,
  name: '2 ovos cozidos',
  weightGrams: 100,
  calories: 155,
  protein: 13,
  carbs: 1,
  fat: 11,
  fiber: 0,
  mealType: 'breakfast' as const,
  date: '2026-11-05',
};

async function receive(actionProposal: unknown) {
  coachService.sendMessage.mockResolvedValue({
    conversationId: 'c1',
    acknowledge: jest.fn().mockResolvedValue(undefined),
    message: {
      id: 'c1-1',
      role: 'coach',
      content: 'Toque para salvar.',
      timestamp: '2026-11-05T12:00:00Z',
      actionProposal,
    },
  });
  await useCoachStore.getState().sendMessage('pedido');
}
const card = () => useCoachStore.getState().messages.find((m) => m.id === 'c1-1')?.actionProposal;

beforeEach(() => {
  jest.clearAllMocks();
  useCoachStore.setState({ messages: [], isLoading: false, conversationId: 'c1' });
  useFoodLogStore.setState({ mealsByDate: {} });
});

it('a proposta chega como cartão e não grava sozinha', async () => {
  await receive(eggs);
  expect(card()?.status).toBe('idle');
  expect(foodLogService.addMeal).not.toHaveBeenCalled();
});

it('Adicionar ao Diário grava com data e tipo, e o registro entra no Diário', async () => {
  foodLogService.addMeal.mockResolvedValue({ ...eggs, id: 'm1', loggedAt: 'x' });
  await receive(eggs);
  await useCoachStore.getState().applyAction('c1-1');
  expect(foodLogService.addMeal).toHaveBeenCalledWith(
    {
      name: '2 ovos cozidos',
      calories: 155,
      protein: 13,
      carbs: 1,
      fat: 11,
      fiber: 0,
      weightGrams: 100,
      mealType: 'breakfast',
      date: '2026-11-05',
    },
    expect.objectContaining({ generation: expect.any(Number) }),
  );
  expect(useFoodLogStore.getState().mealsByDate['2026-11-05']?.[0]?.id).toBe('m1');
  expect(card()?.status).toBe('saved');
});

it('Registrar na Evolução grava o peso na data', async () => {
  weightService.addEntry.mockResolvedValue({ id: 'w1', date: '2026-11-05', weightKg: 78 });
  await receive({
    kind: 'log_weight',
    weightKg: 78,
    date: '2026-11-05',
    replaces: null,
    bigChange: false,
  });
  await useCoachStore.getState().applyAction('c1-1');
  expect(weightService.addEntry).toHaveBeenCalledWith(78, '2026-11-05');
  expect(card()?.status).toBe('saved');
});

it('Marcar como feita pede completed: true e recarrega o plano; dois toques = uma chamada', async () => {
  let resolve: () => void = () => {};
  dietService.toggleMeal.mockReturnValue(new Promise<void>((r) => (resolve = r)));
  await receive({ kind: 'complete_plan_meal', mealId: 'pm1', title: 'Almoço', calories: 650 });
  const first = useCoachStore.getState().applyAction('c1-1');
  const second = useCoachStore.getState().applyAction('c1-1');
  resolve();
  await Promise.all([first, second]);
  expect(dietService.toggleMeal).toHaveBeenCalledTimes(1);
  expect(dietService.toggleMeal).toHaveBeenCalledWith('pm1', { completed: true });
  expect(mockLoadCurrent).toHaveBeenCalled();
});

it('falha ao gravar → erro, e dá para tentar de novo', async () => {
  foodLogService.addMeal.mockRejectedValueOnce(new Error('rede'));
  await receive(eggs);
  await useCoachStore.getState().applyAction('c1-1');
  expect(card()?.status).toBe('error');
  foodLogService.addMeal.mockResolvedValue({ ...eggs, id: 'm1', loggedAt: 'x' });
  await useCoachStore.getState().applyAction('c1-1');
  expect(card()?.status).toBe('saved');
});

it('Agora não fecha o cartão', async () => {
  await receive(eggs);
  useCoachStore.getState().dismissAction('c1-1');
  expect(card()?.status).toBe('dismissed');
});

describe('C2: troca de sessão com o cartão salvando', () => {
  const switchSession = () =>
    useAuthStore.setState({ sessionGeneration: useAuthStore.getState().sessionGeneration + 1 });

  function pending(mock: jest.Mock) {
    const control: { resolve: (v?: unknown) => void; reject: (e: unknown) => void } = {
      resolve: () => {},
      reject: () => {},
    };
    mock.mockReturnValue(
      new Promise((res, rej) => {
        control.resolve = res;
        control.reject = rej;
      }),
    );
    return control;
  }

  it('Adicionar ao Diário vincula o pedido ao dono atual', async () => {
    foodLogService.addMeal.mockResolvedValue({ ...eggs, id: 'm1', loggedAt: 'x' });
    await receive(eggs);
    await useCoachStore.getState().applyAction('c1-1');
    expect(foodLogService.addMeal.mock.calls[0][1]).toEqual({
      userId: useAuthStore.getState().user?.id,
      generation: useAuthStore.getState().sessionGeneration,
    });
  });

  it('resposta depois da troca não entra no Diário da conta seguinte nem muda o cartão', async () => {
    await receive(eggs);
    const call = pending(foodLogService.addMeal);
    const apply = useCoachStore.getState().applyAction('c1-1');
    switchSession();
    useFoodLogStore.setState({ mealsByDate: {} });
    call.resolve({ ...eggs, id: 'mA', loggedAt: 'x' });
    await apply;
    expect(useFoodLogStore.getState().mealsByDate).toEqual({});
    expect(card()?.status).toBe('saving');
  });

  it('falha depois da troca (pedido abortado) não marca erro no cartão', async () => {
    await receive(eggs);
    const call = pending(foodLogService.addMeal);
    const apply = useCoachStore.getState().applyAction('c1-1');
    switchSession();
    call.reject(new Error('canceled'));
    await apply;
    expect(card()?.status).toBe('saving');
  });

  it('peso salvo depois da troca não recarrega a Evolução', async () => {
    await receive({
      kind: 'log_weight',
      weightKg: 78,
      date: '2026-11-05',
      replaces: null,
      bigChange: false,
    });
    const call = pending(weightService.addEntry);
    const apply = useCoachStore.getState().applyAction('c1-1');
    switchSession();
    call.resolve({ id: 'w1', date: '2026-11-05', weightKg: 78 });
    await apply;
    expect(weightService.getHistory).not.toHaveBeenCalled();
    expect(card()?.status).toBe('saving');
  });

  it('refeição do plano marcada depois da troca não recarrega o plano', async () => {
    await receive({ kind: 'complete_plan_meal', mealId: 'pm1', title: 'Almoço', calories: 650 });
    const call = pending(dietService.toggleMeal);
    const apply = useCoachStore.getState().applyAction('c1-1');
    switchSession();
    call.resolve();
    await apply;
    expect(mockLoadCurrent).not.toHaveBeenCalled();
    expect(card()?.status).toBe('saving');
  });
});
