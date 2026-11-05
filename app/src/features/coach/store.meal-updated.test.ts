import { useCoachStore } from './store';
import { useFoodLogStore } from '@features/food-log/store';

// 04/11: o coach corrigiu um registro (carne suína → salmão). O Diário e a
// tela Hoje precisam mostrar o registro novo sem o usuário recarregar.

jest.mock('@shared/services/coach.service', () => ({
  coachService: { sendMessage: jest.fn() },
}));
jest.mock('@shared/services/food-log.service', () => ({
  foodLogService: { getMeals: jest.fn() },
}));
jest.mock('@features/diet/store', () => ({
  useDietStore: { getState: () => ({ loadCurrent: jest.fn() }) },
}));
jest.mock('@shared/services/diet.service', () => ({
  dietService: { stepJob: jest.fn(), getJob: jest.fn(), retryJob: jest.fn() },
}));

const { coachService } = jest.requireMock('@shared/services/coach.service') as {
  coachService: { sendMessage: jest.Mock };
};
const { foodLogService } = jest.requireMock('@shared/services/food-log.service') as {
  foodLogService: { getMeals: jest.Mock; updateMeal?: jest.Mock };
};

const salmon = {
  id: 'm1', name: 'Salmão grelhado', calories: 376, protein: 40, carbs: 0, fat: 24, fiber: 0,
  loggedAt: '2026-11-03 23:14:00+00', mealType: 'dinner' as const,
};

beforeEach(() => {
  useCoachStore.setState({ messages: [], isLoading: false, conversationId: 'c1' });
  useFoodLogStore.setState({ mealsByDate: { '2026-11-03': [{ ...salmon, name: 'Carne suína' }] } });
  foodLogService.getMeals.mockReset().mockResolvedValue([salmon]);
});

it('resposta com mealUpdated recarrega aquele dia do diário', async () => {
  coachService.sendMessage.mockResolvedValue({
    conversationId: 'c1',
    acknowledge: jest.fn().mockResolvedValue(undefined),
    message: {
      id: 'c1-1', role: 'coach', content: 'Pronto, troquei para salmão.', timestamp: '2026-11-04T23:20:00Z',
      mealUpdated: { id: 'm1', date: '2026-11-03' },
    },
  });
  await useCoachStore.getState().sendMessage('sim, pode atualizar');
  expect(foodLogService.getMeals).toHaveBeenCalledWith('2026-11-03');
  expect(useFoodLogStore.getState().mealsByDate['2026-11-03'][0].name).toBe('Salmão grelhado');
});

it('resposta comum não recarrega o diário', async () => {
  coachService.sendMessage.mockResolvedValue({
    conversationId: 'c1',
    acknowledge: jest.fn().mockResolvedValue(undefined),
    message: { id: 'c1-2', role: 'coach', content: 'oi', timestamp: '2026-11-04T23:20:00Z' },
  });
  await useCoachStore.getState().sendMessage('oi');
  expect(foodLogService.getMeals).not.toHaveBeenCalled();
});

describe('cartão da correção proposta (05/11)', () => {
  const proposal = {
    id: 'm1', date: '2026-11-03', currentName: 'Carne suína', name: 'Salmão grelhado',
    weightGrams: 180, mealType: 'dinner' as const, calories: 376, protein: 40, carbs: 0, fat: 24,
    fiber: 0,
  };
  const reply = {
    conversationId: 'c1',
    acknowledge: jest.fn().mockResolvedValue(undefined),
    message: {
      id: 'c1-9', role: 'coach', content: 'Para os mesmos 180 g…', timestamp: '2026-11-04T23:20:00Z',
      mealProposal: proposal,
    },
  };

  beforeEach(() => {
    foodLogService.updateMeal = jest.fn().mockResolvedValue(salmon);
  });

  it('a proposta chega como cartão e NÃO grava sozinha', async () => {
    coachService.sendMessage.mockResolvedValue(reply);
    await useCoachStore.getState().sendMessage('não era suína');
    const msg = useCoachStore.getState().messages.find((m) => m.id === 'c1-9');
    expect(msg?.mealProposal?.status).toBe('idle');
    expect(foodLogService.updateMeal).not.toHaveBeenCalled();
    expect(foodLogService.getMeals).not.toHaveBeenCalled();
  });

  it('Atualizar registro grava pelo PATCH, com o peso, e recarrega o dia', async () => {
    coachService.sendMessage.mockResolvedValue(reply);
    await useCoachStore.getState().sendMessage('não era suína');
    await useCoachStore.getState().applyProposal('c1-9');
    expect(foodLogService.updateMeal).toHaveBeenCalledWith('m1', {
      name: 'Salmão grelhado', calories: 376, protein: 40, carbs: 0, fat: 24, fiber: 0,
      mealType: 'dinner', weightGrams: 180,
    });
    expect(foodLogService.getMeals).toHaveBeenCalledWith('2026-11-03');
    const msg = useCoachStore.getState().messages.find((m) => m.id === 'c1-9');
    expect(msg?.mealProposal?.status).toBe('saved');
    expect(useFoodLogStore.getState().mealsByDate['2026-11-03'][0].name).toBe('Salmão grelhado');
  });

  it('falha ao gravar → status error, sem recarregar', async () => {
    (foodLogService.updateMeal as jest.Mock).mockRejectedValue(new Error('rede'));
    coachService.sendMessage.mockResolvedValue(reply);
    await useCoachStore.getState().sendMessage('não era suína');
    await useCoachStore.getState().applyProposal('c1-9');
    const msg = useCoachStore.getState().messages.find((m) => m.id === 'c1-9');
    expect(msg?.mealProposal?.status).toBe('error');
    expect(foodLogService.getMeals).not.toHaveBeenCalled();
  });

  it('Agora não fecha o cartão', async () => {
    coachService.sendMessage.mockResolvedValue(reply);
    await useCoachStore.getState().sendMessage('não era suína');
    useCoachStore.getState().dismissProposal('c1-9');
    const msg = useCoachStore.getState().messages.find((m) => m.id === 'c1-9');
    expect(msg?.mealProposal?.status).toBe('dismissed');
  });
});
