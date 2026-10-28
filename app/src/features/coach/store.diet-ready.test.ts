import { useCoachStore } from './store';

// Feedback de 27/10: a dieta de 6 refeições foi gerada, mas nada apareceu no
// chat — o usuário achou que o coach tinha parado e só viu o plano na tela Hoje.

const mockDietState: { plan: { meals: unknown[] } | null; loadCurrent: jest.Mock } = {
  plan: null,
  loadCurrent: jest.fn(),
};

jest.mock('@features/diet/store', () => ({
  useDietStore: { getState: () => mockDietState },
}));

jest.mock('@shared/services/coach.service', () => ({ coachService: {} }));

jest.mock('@shared/services/diet.service', () => ({
  dietService: { stepJob: jest.fn(), getJob: jest.fn(), retryJob: jest.fn() },
}));

const ds = () =>
  jest.requireMock('@shared/services/diet.service').dietService as { stepJob: jest.Mock };

const completed = {
  jobId: 'j1',
  status: 'completed',
  daysCompleted: 7,
  totalDays: 7,
  dietId: 'd1',
  error: null,
  errorCode: null,
  errorMessage: null,
};

const coachMsg = (o: Record<string, unknown> = {}) => ({
  id: 'c1-1',
  role: 'coach' as const,
  content: 'Vou montar sua dieta com 6 refeições.',
  timestamp: new Date(),
  ...o,
});

describe('dieta concluída aparece na conversa', () => {
  beforeEach(() => {
    ds().stepJob.mockReset().mockResolvedValue(completed);
    mockDietState.loadCurrent.mockReset().mockImplementation(async () => {
      mockDietState.plan = { meals: [1, 2, 3, 4, 5, 6] };
    });
    mockDietState.plan = null;
    useCoachStore.setState({ messages: [], dietJob: null, activeJobId: null });
  });

  it('o job pedido nesta conversa termina → mensagem "Pronto!" com o nº de refeições e botão da dieta', async () => {
    useCoachStore.setState({ messages: [coachMsg({ dietJobId: 'j1' })] });
    await useCoachStore.getState().runDietGeneration('j1');
    const last = useCoachStore.getState().messages.at(-1);
    expect(last?.role).toBe('coach');
    expect(last?.content).toBe(
      'Pronto! Sua nova dieta está no ar, com 6 refeições por dia. Toque abaixo para ver.',
    );
    // dietGenerated liga o botão "Ver minha dieta" que já existe no chat.
    expect(last?.dietGenerated).toBe(true);
  });

  it('não duplica se o mesmo job concluir de novo (retomada)', async () => {
    useCoachStore.setState({ messages: [coachMsg({ dietJobId: 'j1' })] });
    await useCoachStore.getState().runDietGeneration('j1');
    await useCoachStore.getState().runDietGeneration('j1');
    expect(useCoachStore.getState().messages).toHaveLength(2);
  });

  it('job de outra conversa não escreve nesta', async () => {
    useCoachStore.setState({ messages: [coachMsg()] });
    await useCoachStore.getState().runDietGeneration('j1');
    expect(useCoachStore.getState().messages).toHaveLength(1);
    expect(mockDietState.loadCurrent).toHaveBeenCalled();
  });

  it('sem o plano carregado, a mensagem não inventa número', async () => {
    mockDietState.loadCurrent.mockResolvedValue(undefined);
    mockDietState.loadCurrent.mockImplementation(async () => {});
    useCoachStore.setState({ messages: [coachMsg({ dietJobId: 'j1' })] });
    await useCoachStore.getState().runDietGeneration('j1');
    expect(useCoachStore.getState().messages.at(-1)?.content).toBe(
      'Pronto! Sua nova dieta está no ar. Toque abaixo para ver.',
    );
  });
});
