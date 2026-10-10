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
      message: {
        id: 'c1-123',
        role: 'coach',
        content: 'Resposta do coach',
        timestamp: '2026-01-01T00:00:01Z',
      },
    }),
  },
}));

jest.mock('@features/diet/store', () => ({
  useDietStore: { getState: () => ({ loadCurrent: jest.fn() }) },
}));

jest.mock('@shared/services/diet.service', () => ({
  dietService: { stepJob: jest.fn(), getJob: jest.fn(), retryJob: jest.fn() },
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
    expect(result.current.error).toBe('Não foi possível enviar sua mensagem. Tente novamente.');
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

// Task 3 (spec B): a geração da dieta para e avisa quando falha, em vez de
// congelar "Gerando sua dieta — dia N de 7" por até 2,5 h.
describe('runDietGeneration — falhas', () => {
  const QUOTA = 'Limite diário de IA atingido. Tente novamente amanhã.';
  const GENERIC = 'Não foi possível gerar sua dieta agora. Tente novamente.';
  const ROUND_MS = 8 * 20000; // janela de recuperação: 8 polls de 20 s

  const ds = () =>
    jest.requireMock('@shared/services/diet.service').dietService as {
      stepJob: jest.Mock;
      getJob: jest.Mock;
      retryJob: jest.Mock;
    };
  const job = (o: Record<string, unknown> = {}) => ({
    jobId: 'j1',
    status: 'running',
    daysCompleted: 0,
    totalDays: 7,
    dietId: null,
    error: null,
    errorCode: null,
    errorMessage: null,
    ...o,
  });
  const httpErr = (status: number, data?: unknown) =>
    Object.assign(new Error(String(status)), { isAxiosError: true, response: { status, data } });
  const netErr = () =>
    Object.assign(new Error('timeout of 150000ms exceeded'), {
      isAxiosError: true,
      code: 'ECONNABORTED',
    });

  beforeEach(() => {
    jest.useFakeTimers();
    ds().stepJob.mockReset();
    ds().getJob.mockReset();
    ds().retryJob.mockReset();
    useCoachStore.setState({ dietJob: null, activeJobId: null });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('429 AI_QUOTA_EXCEEDED no step para na hora com a mensagem de cota', async () => {
    ds().stepJob.mockRejectedValue(httpErr(429, { error: 'AI_QUOTA_EXCEEDED', message: 'x' }));
    await useCoachStore.getState().runDietGeneration('j1');
    const dj = useCoachStore.getState().dietJob;
    expect(dj?.status).toBe('failed');
    expect(dj?.errorMessage).toBe(QUOTA);
    expect(ds().stepJob).toHaveBeenCalledTimes(1);
    expect(ds().getJob).not.toHaveBeenCalled();
  });

  it('429 sem corpo (backend antigo) também para com a mensagem de cota', async () => {
    ds().stepJob.mockRejectedValue(httpErr(429));
    await useCoachStore.getState().runDietGeneration('j1');
    expect(useCoachStore.getState().dietJob).toMatchObject({
      status: 'failed',
      errorMessage: QUOTA,
    });
    expect(ds().stepJob).toHaveBeenCalledTimes(1);
  });

  it('outro 4xx (404/422) para e mostra a mensagem do servidor', async () => {
    ds().stepJob.mockRejectedValue(
      httpErr(422, { error: 'INVALID_JOB_INPUT', message: 'Dados da geração inválidos.' }),
    );
    await useCoachStore.getState().runDietGeneration('j1');
    expect(useCoachStore.getState().dietJob).toMatchObject({
      status: 'failed',
      errorMessage: 'Dados da geração inválidos.',
    });
    expect(ds().stepJob).toHaveBeenCalledTimes(1);
  });

  it('step devolve status failed → para e mostra a mensagem do servidor', async () => {
    ds().stepJob.mockResolvedValue(
      job({
        status: 'failed',
        daysCompleted: 3,
        errorCode: 'AI_QUOTA_EXCEEDED',
        errorMessage: 'Limite diário de IA atingido. Tente amanhã.',
      }),
    );
    await useCoachStore.getState().runDietGeneration('j1');
    expect(useCoachStore.getState().dietJob).toMatchObject({
      status: 'failed',
      daysCompleted: 3,
      errorMessage: 'Limite diário de IA atingido. Tente amanhã.',
    });
    expect(ds().stepJob).toHaveBeenCalledTimes(1);
  });

  it('step failed sem errorMessage (backend antigo) usa a mensagem genérica', async () => {
    ds().stepJob.mockResolvedValue(job({ status: 'failed', daysCompleted: 2 }));
    await useCoachStore.getState().runDietGeneration('j1');
    expect(useCoachStore.getState().dietJob).toMatchObject({
      status: 'failed',
      errorMessage: GENERIC,
    });
  });

  it('5xx seguido de getJob failed (timeout no servidor) para com a mensagem do servidor', async () => {
    ds().stepJob.mockRejectedValue(httpErr(502, { error: 'STEP_TIMEOUT' }));
    ds().getJob.mockResolvedValue(
      job({
        status: 'failed',
        daysCompleted: 3,
        errorCode: 'STEP_TIMEOUT',
        errorMessage: 'A IA demorou demais.',
      }),
    );
    const p = useCoachStore.getState().runDietGeneration('j1');
    await jest.advanceTimersByTimeAsync(20000);
    await p;
    expect(useCoachStore.getState().dietJob).toMatchObject({
      status: 'failed',
      errorMessage: 'A IA demorou demais.',
    });
    expect(ds().stepJob).toHaveBeenCalledTimes(1);
  });

  it('5xx/rede repetidos sem progresso falham após 3 rodadas (não 30)', async () => {
    ds().stepJob.mockRejectedValue(netErr());
    ds().getJob.mockResolvedValue(job({ daysCompleted: 0 }));
    let done = false;
    const p = useCoachStore
      .getState()
      .runDietGeneration('j1')
      .then(() => {
        done = true;
      });
    await jest.advanceTimersByTimeAsync(3 * ROUND_MS + 1000);
    expect(done).toBe(true);
    await p;
    expect(useCoachStore.getState().dietJob).toMatchObject({
      status: 'failed',
      errorMessage: GENERIC,
    });
    expect(ds().stepJob).toHaveBeenCalledTimes(3);
  });

  it('progresso entre erros zera a contagem de rodadas sem progresso', async () => {
    // 2 rodadas paradas, 1 com avanço, mais 2 paradas e então conclui.
    ds()
      .stepJob.mockRejectedValueOnce(netErr())
      .mockRejectedValueOnce(netErr())
      .mockRejectedValueOnce(netErr())
      .mockRejectedValueOnce(netErr())
      .mockRejectedValueOnce(netErr())
      .mockResolvedValue(job({ status: 'completed', daysCompleted: 7 }));
    let polls = 0;
    ds().getJob.mockImplementation(async () => {
      polls++;
      return job({ daysCompleted: polls <= 16 ? 0 : 1 });
    });
    const p = useCoachStore.getState().runDietGeneration('j1');
    await jest.advanceTimersByTimeAsync(5 * ROUND_MS);
    await p;
    expect(useCoachStore.getState().dietJob?.status).toBe('completed');
    expect(ds().stepJob).toHaveBeenCalledTimes(6);
  });

  it('marca a rodada como lenta (slow) depois de um erro de step, e limpa ao avançar', async () => {
    ds()
      .stepJob.mockRejectedValueOnce(netErr())
      .mockResolvedValue(job({ status: 'completed', daysCompleted: 7 }));
    ds().getJob.mockResolvedValue(job({ daysCompleted: 1 }));
    const p = useCoachStore.getState().runDietGeneration('j1');
    await jest.advanceTimersByTimeAsync(0);
    expect(useCoachStore.getState().dietJob).toMatchObject({ status: 'running', slow: true });
    await jest.advanceTimersByTimeAsync(20000);
    await p;
    expect(useCoachStore.getState().dietJob).toMatchObject({ status: 'completed', slow: false });
  });

  it('single-flight: retry/resume com o loop do mesmo job em andamento não abre um segundo loop', async () => {
    let release: (v: unknown) => void = () => {};
    ds().stepJob.mockImplementationOnce(() => new Promise((r) => (release = r)));
    ds().stepJob.mockResolvedValue(job({ status: 'completed', daysCompleted: 7 }));
    const first = useCoachStore.getState().runDietGeneration('j1');
    const retry = useCoachStore.getState().retryDietGeneration('j1');
    const resume = useCoachStore.getState().runDietGeneration('j1');
    await jest.advanceTimersByTimeAsync(0);
    expect(ds().stepJob).toHaveBeenCalledTimes(1);
    expect(ds().retryJob).not.toHaveBeenCalled();
    release(job({ status: 'completed', daysCompleted: 7 }));
    await Promise.all([first, retry, resume]);
    expect(ds().stepJob).toHaveBeenCalledTimes(1);
    expect(useCoachStore.getState().dietJob?.status).toBe('completed');
  });

  it('retry depois de uma falha reabre o job e religa o loop (sem apagar o banner antes)', async () => {
    ds().stepJob.mockRejectedValueOnce(httpErr(429, { error: 'AI_QUOTA_EXCEEDED' }));
    await useCoachStore.getState().runDietGeneration('j1');
    expect(useCoachStore.getState().dietJob?.status).toBe('failed');

    ds().retryJob.mockResolvedValue(job({ status: 'pending', daysCompleted: 3 }));
    ds().stepJob.mockResolvedValue(job({ status: 'completed', daysCompleted: 7 }));
    const seen: Array<string | undefined> = [];
    const unsub = useCoachStore.subscribe((s) => seen.push(s.dietJob?.status));
    await useCoachStore.getState().retryDietGeneration();
    unsub();
    expect(ds().retryJob).toHaveBeenCalledWith('j1');
    expect(seen).not.toContain(undefined);
    expect(useCoachStore.getState().dietJob).toMatchObject({
      status: 'completed',
      errorMessage: null,
    });
  });
});

// Fix round 1 da Task 3.
describe('geração da dieta — boot, retry, sessão e 401', () => {
  const GENERIC = 'Não foi possível gerar sua dieta agora. Tente novamente.';
  const ds = () =>
    jest.requireMock('@shared/services/diet.service').dietService as {
      stepJob: jest.Mock;
      getJob: jest.Mock;
      retryJob: jest.Mock;
    };
  const job = (o: Record<string, unknown> = {}) => ({
    jobId: 'j1',
    status: 'running',
    daysCompleted: 0,
    totalDays: 7,
    dietId: null,
    error: null,
    errorCode: null,
    errorMessage: null,
    ...o,
  });
  const httpErr = (status: number, data?: unknown) =>
    Object.assign(new Error(String(status)), { isAxiosError: true, response: { status, data } });
  const netErr = () => Object.assign(new Error('Network Error'), { isAxiosError: true });

  beforeEach(() => {
    jest.useFakeTimers();
    ds().stepJob.mockReset();
    ds().getJob.mockReset();
    ds().retryJob.mockReset();
    useCoachStore.getState().resetDietGeneration();
  });
  afterEach(() => {
    useCoachStore.getState().resetDietGeneration();
    jest.useRealTimers();
  });

  describe('resumeDietJob (boot)', () => {
    it('job failed mostra o banner de falha com a mensagem e NÃO liga o polling', async () => {
      await useCoachStore.getState().resumeDietJob(
        job({
          status: 'failed',
          daysCompleted: 4,
          errorCode: 'STEP_TIMEOUT',
          errorMessage: 'A geração parou de responder.',
        }) as never,
      );
      expect(useCoachStore.getState().activeJobId).toBe('j1');
      expect(useCoachStore.getState().dietJob).toEqual({
        status: 'failed',
        daysCompleted: 4,
        totalDays: 7,
        slow: false,
        errorMessage: 'A geração parou de responder.',
      });
      await jest.advanceTimersByTimeAsync(60000);
      expect(ds().stepJob).not.toHaveBeenCalled();
      expect(ds().getJob).not.toHaveBeenCalled();
    });

    it('job failed sem errorMessage usa a mensagem genérica', async () => {
      await useCoachStore
        .getState()
        .resumeDietJob(job({ status: 'failed', daysCompleted: 2 }) as never);
      expect(useCoachStore.getState().dietJob?.errorMessage).toBe(GENERIC);
    });

    it('job running/pending retoma o polling como antes', async () => {
      ds().stepJob.mockResolvedValue(job({ status: 'completed', daysCompleted: 7 }));
      await useCoachStore.getState().resumeDietJob(job({ status: 'pending' }) as never);
      expect(ds().stepJob).toHaveBeenCalledWith('j1');
      expect(useCoachStore.getState().dietJob?.status).toBe('completed');
    });

    it('job failed não sobrescreve o loop vivo do mesmo job', async () => {
      let release: (v: unknown) => void = () => {};
      ds().stepJob.mockImplementationOnce(() => new Promise((r) => (release = r)));
      const loop = useCoachStore.getState().runDietGeneration('j1');
      await useCoachStore
        .getState()
        .resumeDietJob(job({ status: 'failed', errorMessage: 'x' }) as never);
      expect(useCoachStore.getState().dietJob?.status).toBe('running');
      release(job({ status: 'completed', daysCompleted: 7 }));
      await loop;
    });
  });

  describe('retryDietGeneration com POST retry falhando', () => {
    it('4xx mantém o banner failed com a mensagem do servidor', async () => {
      useCoachStore.setState({
        activeJobId: 'j1',
        dietJob: {
          status: 'failed',
          daysCompleted: 3,
          totalDays: 7,
          slow: false,
          errorMessage: 'antes',
        },
      });
      ds().retryJob.mockRejectedValue(
        httpErr(404, { error: 'JOB_NOT_FOUND', message: 'Job de geração não encontrado' }),
      );
      await useCoachStore.getState().retryDietGeneration();
      expect(useCoachStore.getState().dietJob).toEqual({
        status: 'failed',
        daysCompleted: 3,
        totalDays: 7,
        slow: false,
        errorMessage: 'Job de geração não encontrado',
      });
      expect(ds().stepJob).not.toHaveBeenCalled();
    });

    it('rede/5xx mostra a mensagem genérica (inclusive vindo da aba Dieta, sem banner antes)', async () => {
      ds().retryJob.mockRejectedValue(netErr());
      await useCoachStore.getState().retryDietGeneration('j9');
      expect(useCoachStore.getState().activeJobId).toBe('j9');
      expect(useCoachStore.getState().dietJob).toMatchObject({
        status: 'failed',
        errorMessage: GENERIC,
      });

      ds().retryJob.mockRejectedValue(
        httpErr(500, { error: 'INTERNAL_SERVER_ERROR', message: 'boom' }),
      );
      await useCoachStore.getState().retryDietGeneration();
      expect(useCoachStore.getState().dietJob?.errorMessage).toBe(GENERIC);
    });
  });

  describe('sessão (logout) encerra o loop', () => {
    it('reset durante um step em voo: nenhum /step a mais e nenhum banner do usuário anterior', async () => {
      let release: (v: unknown) => void = () => {};
      ds().stepJob.mockImplementationOnce(() => new Promise((r) => (release = r)));
      ds().stepJob.mockResolvedValue(job({ daysCompleted: 2 }));
      const loop = useCoachStore.getState().runDietGeneration('j1');
      await jest.advanceTimersByTimeAsync(0);
      useCoachStore.getState().resetDietGeneration();
      release(job({ daysCompleted: 1 }));
      await jest.advanceTimersByTimeAsync(600000);
      await loop;
      expect(ds().stepJob).toHaveBeenCalledTimes(1);
      expect(useCoachStore.getState().dietJob).toBeNull();
      expect(useCoachStore.getState().activeJobId).toBeNull();
    });

    it('reset durante a janela de recuperação: não consulta getJob nem falha depois', async () => {
      ds().stepJob.mockRejectedValue(netErr());
      ds().getJob.mockResolvedValue(job());
      const loop = useCoachStore.getState().runDietGeneration('j1');
      await jest.advanceTimersByTimeAsync(0);
      useCoachStore.getState().resetDietGeneration();
      await jest.advanceTimersByTimeAsync(3 * 160000 + 1000);
      await loop;
      expect(ds().getJob).not.toHaveBeenCalled();
      expect(ds().stepJob).toHaveBeenCalledTimes(1);
      expect(useCoachStore.getState().dietJob).toBeNull();
    });

    it('depois do reset, um novo login pode gerar o mesmo job de novo (single-flight não fica preso)', async () => {
      ds().stepJob.mockImplementationOnce(() => new Promise(() => {}));
      void useCoachStore.getState().runDietGeneration('j1');
      await jest.advanceTimersByTimeAsync(0);
      useCoachStore.getState().resetDietGeneration();
      ds().stepJob.mockResolvedValue(job({ status: 'completed', daysCompleted: 7 }));
      await useCoachStore.getState().runDietGeneration('j1');
      expect(ds().stepJob).toHaveBeenCalledTimes(2);
      expect(useCoachStore.getState().dietJob?.status).toBe('completed');
    });

    it('clear() também encerra o loop', async () => {
      ds().stepJob.mockRejectedValue(netErr());
      ds().getJob.mockResolvedValue(job());
      const loop = useCoachStore.getState().runDietGeneration('j1');
      await jest.advanceTimersByTimeAsync(0);
      useCoachStore.getState().clear();
      await jest.advanceTimersByTimeAsync(3 * 160000 + 1000);
      await loop;
      expect(ds().getJob).not.toHaveBeenCalled();
      expect(useCoachStore.getState().dietJob).toBeNull();
    });
  });

  describe('401 no loop', () => {
    it('401 no step não vira falha "Não autorizado": segue como transitório', async () => {
      ds()
        .stepJob.mockRejectedValueOnce(
          httpErr(401, { error: 'UNAUTHORIZED', message: 'Não autorizado' }),
        )
        .mockResolvedValue(job({ status: 'completed', daysCompleted: 7 }));
      ds().getJob.mockResolvedValue(job({ daysCompleted: 1 }));
      const loop = useCoachStore.getState().runDietGeneration('j1');
      await jest.advanceTimersByTimeAsync(0);
      expect(useCoachStore.getState().dietJob).toMatchObject({ status: 'running', slow: true });
      await jest.advanceTimersByTimeAsync(20000);
      await loop;
      expect(useCoachStore.getState().dietJob?.status).toBe('completed');
    });

    it('401 com a sessão derrubada (clearToken) para em silêncio', async () => {
      ds().stepJob.mockImplementationOnce(async () => {
        // o interceptor do api chama clearToken antes de rejeitar
        useCoachStore.getState().resetDietGeneration();
        throw httpErr(401, { error: 'UNAUTHORIZED', message: 'Não autorizado' });
      });
      ds().getJob.mockResolvedValue(job());
      const loop = useCoachStore.getState().runDietGeneration('j1');
      await jest.advanceTimersByTimeAsync(3 * 160000 + 1000);
      await loop;
      expect(ds().stepJob).toHaveBeenCalledTimes(1);
      expect(ds().getJob).not.toHaveBeenCalled();
      expect(useCoachStore.getState().dietJob).toBeNull();
    });
  });
});

// Fix final do PR1: STALE = "ninguém estava dirigindo" (app em segundo plano
// >10 min), não uma falha — retoma sozinho em vez de pedir um toque.
describe('geração da dieta — STALE retoma automaticamente', () => {
  const GENERIC = 'Não foi possível gerar sua dieta agora. Tente novamente.';
  const ds = () =>
    jest.requireMock('@shared/services/diet.service').dietService as {
      stepJob: jest.Mock;
      getJob: jest.Mock;
      retryJob: jest.Mock;
    };
  const job = (o: Record<string, unknown> = {}) => ({
    jobId: 'j1',
    status: 'running',
    daysCompleted: 0,
    totalDays: 7,
    dietId: null,
    error: null,
    errorCode: null,
    errorMessage: null,
    ...o,
  });
  const staleJob = (days: number) =>
    job({
      status: 'failed',
      daysCompleted: days,
      errorCode: 'STALE',
      errorMessage: 'A geração parou de responder.',
    });
  const netErr = () =>
    Object.assign(new Error('timeout of 150000ms exceeded'), {
      isAxiosError: true,
      code: 'ECONNABORTED',
    });

  beforeEach(() => {
    jest.useFakeTimers();
    ds().stepJob.mockReset();
    ds().getJob.mockReset();
    ds().retryJob.mockReset();
    useCoachStore.getState().resetDietGeneration();
  });
  afterEach(() => {
    useCoachStore.getState().resetDietGeneration();
    jest.useRealTimers();
  });

  describe('loop', () => {
    it('step devolve failed STALE → reabre uma vez e segue até concluir, sem mostrar falha', async () => {
      ds()
        .stepJob.mockResolvedValueOnce(staleJob(3))
        .mockResolvedValue(job({ status: 'completed', daysCompleted: 7 }));
      ds().retryJob.mockResolvedValue(job({ status: 'running', daysCompleted: 3 }));
      const seen: (string | undefined)[] = [];
      const unsub = useCoachStore.subscribe((s) => seen.push(s.dietJob?.status));
      const p = useCoachStore.getState().runDietGeneration('j1');
      await jest.advanceTimersByTimeAsync(10000);
      await p;
      unsub();
      expect(ds().retryJob).toHaveBeenCalledTimes(1);
      expect(ds().retryJob).toHaveBeenCalledWith('j1');
      expect(ds().stepJob).toHaveBeenCalledTimes(2);
      expect(seen).not.toContain('failed');
      expect(useCoachStore.getState().dietJob).toMatchObject({
        status: 'completed',
        errorMessage: null,
      });
    });

    it('getJob da recuperação devolve failed STALE → reabre e volta ao step', async () => {
      ds()
        .stepJob.mockRejectedValueOnce(netErr())
        .mockResolvedValue(job({ status: 'completed', daysCompleted: 7 }));
      ds().getJob.mockResolvedValue(staleJob(2));
      ds().retryJob.mockResolvedValue(job({ status: 'running', daysCompleted: 2 }));
      const p = useCoachStore.getState().runDietGeneration('j1');
      await jest.advanceTimersByTimeAsync(30000);
      await p;
      expect(ds().retryJob).toHaveBeenCalledTimes(1);
      expect(ds().stepJob).toHaveBeenCalledTimes(2);
      expect(useCoachStore.getState().dietJob?.status).toBe('completed');
    });

    it('segundo STALE na mesma execução do loop → mostra a falha', async () => {
      ds().stepJob.mockResolvedValue(staleJob(3));
      ds().retryJob.mockResolvedValue(job({ status: 'running', daysCompleted: 3 }));
      const p = useCoachStore.getState().runDietGeneration('j1');
      await jest.advanceTimersByTimeAsync(10000);
      await p;
      expect(ds().retryJob).toHaveBeenCalledTimes(1);
      expect(ds().stepJob).toHaveBeenCalledTimes(2);
      expect(useCoachStore.getState().dietJob).toMatchObject({
        status: 'failed',
        daysCompleted: 3,
        errorMessage: 'A geração parou de responder.',
      });
    });

    it('POST retry falha ao reabrir o STALE → mostra a falha', async () => {
      ds().stepJob.mockResolvedValue(staleJob(3));
      ds().retryJob.mockRejectedValue(netErr());
      const p = useCoachStore.getState().runDietGeneration('j1');
      await jest.advanceTimersByTimeAsync(10000);
      await p;
      expect(ds().stepJob).toHaveBeenCalledTimes(1);
      expect(useCoachStore.getState().dietJob).toMatchObject({
        status: 'failed',
        errorMessage: GENERIC,
      });
    });
  });

  describe('resumeDietJob (boot)', () => {
    it('job failed STALE → reabre (retry) e liga exatamente um loop', async () => {
      ds().retryJob.mockResolvedValue(job({ status: 'running', daysCompleted: 4 }));
      let release: (v: unknown) => void = () => {};
      ds()
        .stepJob.mockImplementationOnce(() => new Promise((r) => (release = r)))
        .mockResolvedValue(job({ status: 'completed', daysCompleted: 7 }));
      const seen: (string | undefined)[] = [];
      const unsub = useCoachStore.subscribe((s) => seen.push(s.dietJob?.status));
      const p = useCoachStore.getState().resumeDietJob(staleJob(4) as never);
      // Boot duplicado (RootNavigator + aba Dieta) não reabre duas vezes.
      const p2 = useCoachStore.getState().resumeDietJob(staleJob(4) as never);
      await jest.advanceTimersByTimeAsync(0);
      expect(ds().retryJob).toHaveBeenCalledTimes(1);
      expect(ds().retryJob).toHaveBeenCalledWith('j1');
      expect(ds().stepJob).toHaveBeenCalledTimes(1);
      expect(useCoachStore.getState().activeJobId).toBe('j1');
      // Não pisca "dia 1": parte do dia em que parou.
      expect(useCoachStore.getState().dietJob).toMatchObject({
        status: 'running',
        daysCompleted: 4,
      });
      // Retomada repetida (ex.: segundo foco) não abre outro loop.
      const again = useCoachStore.getState().runDietGeneration('j1');
      await jest.advanceTimersByTimeAsync(0);
      expect(ds().stepJob).toHaveBeenCalledTimes(1);
      release(job({ status: 'completed', daysCompleted: 7 }));
      await Promise.all([p, p2, again]);
      unsub();
      expect(ds().retryJob).toHaveBeenCalledTimes(1);
      expect(ds().stepJob).toHaveBeenCalledTimes(1);
      expect(seen).not.toContain('failed');
      expect(useCoachStore.getState().dietJob?.status).toBe('completed');
    });

    it('job failed AI_QUOTA_EXCEEDED → só o banner, sem retry nem polling', async () => {
      await useCoachStore.getState().resumeDietJob(
        job({
          status: 'failed',
          daysCompleted: 2,
          errorCode: 'AI_QUOTA_EXCEEDED',
          errorMessage: 'Limite diário de IA atingido.',
        }) as never,
      );
      await jest.advanceTimersByTimeAsync(60000);
      expect(ds().retryJob).not.toHaveBeenCalled();
      expect(ds().stepJob).not.toHaveBeenCalled();
      expect(useCoachStore.getState().dietJob).toMatchObject({
        status: 'failed',
        daysCompleted: 2,
        errorMessage: 'Limite diário de IA atingido.',
      });
    });
  });
});

describe('envio de voz vinculado à operação', () => {
  const service = jest.requireMock('@shared/services/coach.service').coachService;
  beforeEach(() => {
    useCoachStore.getState().clear();
  });

  it('operação já cancelada não escreve mensagem nem chama a API', async () => {
    const controller = new AbortController();
    controller.abort();
    const calls = service.sendMessage.mock.calls.length;
    expect(
      await useCoachStore.getState().sendMessage('voz antiga', {
        signal: controller.signal,
        isValid: () => false,
      }),
    ).toBe(false);
    expect(useCoachStore.getState().messages).toEqual([]);
    expect(service.sendMessage.mock.calls.length).toBe(calls);
  });

  it('resposta antiga após cancelamento não altera conversa nova nem inicia geração', async () => {
    let resolve: (value: unknown) => void = () => {};
    service.sendMessage.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const controller = new AbortController();
    const sending = useCoachStore.getState().sendMessage('voz antiga', {
      signal: controller.signal,
      isValid: () => !controller.signal.aborted,
    });
    controller.abort();
    expect(useCoachStore.getState().isLoading).toBe(false);
    useCoachStore.setState({ conversationId: 'new-session', messages: [], error: null });
    const runJob = jest.spyOn(useCoachStore.getState(), 'runDietGeneration');
    resolve({
      conversationId: 'old-session',
      message: {
        id: 'old-msg',
        role: 'coach',
        content: 'antiga',
        timestamp: '2026-10-10T00:00:00Z',
        dietJobId: 'old-job',
      },
    });
    expect(await sending).toBe(false);
    expect(useCoachStore.getState().conversationId).toBe('new-session');
    expect(useCoachStore.getState().messages).toEqual([]);
    expect(runJob).not.toHaveBeenCalled();
    runJob.mockRestore();
  });
});
