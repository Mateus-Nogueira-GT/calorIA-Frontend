import { act, renderHook } from '@testing-library/react-native';
import { useCoachStore } from './store';

jest.mock('@shared/services/coach.service', () => ({
  coachService: {
    getHistory: jest.fn().mockResolvedValue([
      { id: '1', role: 'coach', content: 'Olá!', timestamp: '2026-01-01T00:00:00Z' },
    ]),
    sendMessage: jest.fn().mockResolvedValue({
      id: '2', role: 'coach', content: 'Resposta do coach', timestamp: '2026-01-01T00:00:01Z',
    }),
  },
}));

describe('useCoachStore', () => {
  beforeEach(() => useCoachStore.setState({ messages: [], isLoading: false, error: null, hasLoadedHistory: false, lastFailedAction: null }));

  it('carrega o histórico corretamente', async () => {
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

  it('preserva canGenerateDiet em mensagens do histórico', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { coachService } = require('@shared/services/coach.service');
    coachService.getHistory.mockResolvedValueOnce([
      { id: 'h1', role: 'coach', content: 'Pronto!', timestamp: '2026-01-01T00:00:00Z', canGenerateDiet: true },
    ]);
    const { result } = renderHook(() => useCoachStore());
    await act(() => result.current.loadHistory());
    expect(result.current.messages[0].canGenerateDiet).toBe(true);
  });

  it('preserva canGenerateDiet na resposta a sendMessage', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { coachService } = require('@shared/services/coach.service');
    coachService.sendMessage.mockResolvedValueOnce({
      id: 'r1', role: 'coach', content: 'Pode gerar!', timestamp: '2026-01-01T00:00:01Z', canGenerateDiet: true,
    });
    const { result } = renderHook(() => useCoachStore());
    await act(() => result.current.sendMessage('Tudo certo'));
    const last = result.current.messages[result.current.messages.length - 1];
    expect(last.canGenerateDiet).toBe(true);
  });
});
