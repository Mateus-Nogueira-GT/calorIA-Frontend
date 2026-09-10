import { act, renderHook } from '@testing-library/react-native';
import { useCoachStore } from './store';

jest.mock('@shared/services/coach.service', () => ({
  coachService: {
    getHistory: jest.fn().mockResolvedValue({
      status: 'collecting',
      messages: [{ id: 'c1-0', role: 'coach', content: 'Olá!', timestamp: '2026-01-01T00:00:00Z' }],
    }),
    sendMessage: jest.fn().mockResolvedValue({
      conversationId: 'c1',
      message: { id: 'c1-123', role: 'coach', content: 'Resposta do coach', timestamp: '2026-01-01T00:00:01Z' },
    }),
  },
}));

jest.mock('@features/diet/store', () => ({
  useDietStore: { getState: () => ({ loadCurrent: jest.fn() }) },
}));

jest.mock('@shared/services/diet.service', () => ({
  dietService: { stepJob: jest.fn(), getJob: jest.fn() },
}));

describe('useCoachStore', () => {
  beforeEach(() =>
    useCoachStore.setState({
      conversationId: null,
      messages: [],
      isLoading: false,
      error: null,
      hasLoadedHistory: false,
      lastFailedAction: null,
    }),
  );

  it('não chama a API quando ainda não há conversa', async () => {
    const { result } = renderHook(() => useCoachStore());
    await act(() => result.current.loadHistory());
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.hasLoadedHistory).toBe(true);
  });

  it('carrega o histórico corretamente quando há conversationId', async () => {
    useCoachStore.setState({ conversationId: 'c1' });
    const { result } = renderHook(() => useCoachStore());
    await act(() => result.current.loadHistory());
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe('Olá!');
  });

  it('adiciona mensagem do usuário otimisticamente e depois a resposta do coach', async () => {
    const { result } = renderHook(() => useCoachStore());
    await act(() => result.current.sendMessage('Quero emagrecer'));
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].role).toBe('user');
    expect(result.current.messages[1].role).toBe('coach');
    expect(result.current.conversationId).toBe('c1');
  });

  it('isLoading é false após envio concluído', async () => {
    const { result } = renderHook(() => useCoachStore());
    await act(() => result.current.sendMessage('Teste'));
    expect(result.current.isLoading).toBe(false);
  });

  it('define erro amigável quando o envio falha', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { coachService } = require('@shared/services/coach.service');
    coachService.sendMessage.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useCoachStore());
    await act(() => result.current.sendMessage('Teste'));
    expect(result.current.error).toBe('Nao foi possivel enviar sua mensagem. Tente novamente.');
    expect(result.current.lastFailedAction).toBe('send');
  });

  it('429 AI_QUOTA_EXCEEDED mostra a mensagem de limite diário, não a genérica', async () => {
    const { coachService } = jest.requireMock('@shared/services/coach.service');
    const quota = Object.assign(new Error('429'), {
      isAxiosError: true,
      response: { status: 429, data: { error: 'AI_QUOTA_EXCEEDED' } },
    });
    coachService.sendMessage.mockRejectedValueOnce(quota);

    const { result } = renderHook(() => useCoachStore());
    await act(() => result.current.sendMessage('oi'));

    expect(result.current.error).toBe('Você atingiu o limite diário do coach. Volte amanhã.');
    expect(result.current.lastFailedAction).toBe('send');
  });

  it('preserva dietGenerated em mensagens do histórico', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { coachService } = require('@shared/services/coach.service');
    coachService.getHistory.mockResolvedValueOnce({
      status: 'completed',
      messages: [
        {
          id: 'h1',
          role: 'coach',
          content: 'Pronto!',
          timestamp: '2026-01-01T00:00:00Z',
          dietGenerated: true,
          dietId: 'd1',
        },
      ],
    });
    useCoachStore.setState({ conversationId: 'c1' });
    const { result } = renderHook(() => useCoachStore());
    await act(() => result.current.loadHistory());
    expect(result.current.messages[0].dietGenerated).toBe(true);
  });

  it('preserva dietGenerated na resposta a sendMessage', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { coachService } = require('@shared/services/coach.service');
    coachService.sendMessage.mockResolvedValueOnce({
      conversationId: 'c1',
      message: {
        id: 'r1',
        role: 'coach',
        content: 'Pode ver!',
        timestamp: '2026-01-01T00:00:01Z',
        dietGenerated: true,
        dietId: 'd1',
      },
    });
    const { result } = renderHook(() => useCoachStore());
    await act(() => result.current.sendMessage('Tudo certo'));
    const last = result.current.messages[result.current.messages.length - 1];
    expect(last.dietGenerated).toBe(true);
  });
});
