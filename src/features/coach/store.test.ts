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
  beforeEach(() => useCoachStore.setState({ messages: [], isLoading: false }));

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
});
