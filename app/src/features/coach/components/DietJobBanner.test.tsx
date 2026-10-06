import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { DietJobBanner } from './DietJobBanner';
import { useCoachStore } from '../store';

jest.mock('@features/diet/store', () => ({
  useDietStore: { getState: () => ({ loadCurrent: jest.fn() }) },
}));

jest.mock('@shared/services/diet.service', () => ({
  dietService: { stepJob: jest.fn(), getJob: jest.fn(), retryJob: jest.fn() },
}));

const ds = () =>
  jest.requireMock('@shared/services/diet.service').dietService as {
    stepJob: jest.Mock;
    getJob: jest.Mock;
    retryJob: jest.Mock;
  };

describe('DietJobBanner', () => {
  beforeEach(() => {
    ds().stepJob.mockReset();
    ds().getJob.mockReset();
    ds().retryJob.mockReset();
    useCoachStore.setState({ dietJob: null, activeJobId: null });
  });

  it('mostra o progresso normal "dia N de 7"', () => {
    useCoachStore.setState({
      dietJob: {
        status: 'running',
        daysCompleted: 3,
        totalDays: 7,
        slow: false,
        errorMessage: null,
      },
    });
    const { getByText } = render(<DietJobBanner />);
    expect(getByText(/Gerando sua dieta — dia 4 de\s+7/)).toBeTruthy();
  });

  it('depois de uma rodada lenta mostra "Ainda trabalhando no dia N…"', async () => {
    jest.useFakeTimers();
    try {
      ds().stepJob.mockRejectedValue(
        Object.assign(new Error('timeout'), { isAxiosError: true, code: 'ECONNABORTED' }),
      );
      ds().getJob.mockResolvedValue({
        jobId: 'j1',
        status: 'running',
        daysCompleted: 0,
        totalDays: 7,
        dietId: null,
        error: null,
        errorCode: null,
        errorMessage: null,
      });
      const { getByText } = render(<DietJobBanner />);
      let p: Promise<void> = Promise.resolve();
      await act(async () => {
        p = useCoachStore.getState().runDietGeneration('j1');
        await jest.advanceTimersByTimeAsync(20000);
      });
      expect(getByText('Ainda trabalhando no dia 1…')).toBeTruthy();
      // encerra o loop (3 rodadas sem progresso) para não vazar timers.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(3 * 160000);
        await p;
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('falha mostra a mensagem do servidor e o botão "Tentar novamente" que reabre o job', async () => {
    useCoachStore.setState({
      activeJobId: 'j1',
      dietJob: {
        status: 'failed',
        daysCompleted: 3,
        totalDays: 7,
        slow: false,
        errorMessage: 'Limite diário de IA atingido. Tente amanhã.',
      },
    });
    ds().retryJob.mockRejectedValue(new Error('still failed'));
    const { getByText, getByTestId } = render(<DietJobBanner />);
    expect(getByText('A geração da dieta falhou')).toBeTruthy();
    expect(getByText('Limite diário de IA atingido. Tente amanhã.')).toBeTruthy();
    expect(getByText('Tentar novamente')).toBeTruthy();
    await act(async () => {
      fireEvent.press(getByTestId('diet-job-retry'));
    });
    expect(ds().retryJob).toHaveBeenCalledWith('j1');
  });
});
