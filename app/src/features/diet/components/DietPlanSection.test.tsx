import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { DietPlanSection } from './DietPlanSection';
import { useDietStore } from '../store';
import { useCoachStore } from '@features/coach/store';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('@shared/services/diet.service', () => ({
  dietService: { stepJob: jest.fn(), getJob: jest.fn(), retryJob: jest.fn() },
}));

const ds = () =>
  jest.requireMock('@shared/services/diet.service').dietService as {
    stepJob: jest.Mock;
    retryJob: jest.Mock;
  };

/** M8 + Task 3: o "Retomar geração" da aba Dieta usa o mesmo fluxo do banner. */
describe('DietPlanSection — plano incompleto (retomar geração)', () => {
  beforeEach(() => {
    ds().stepJob.mockReset();
    ds().retryJob.mockReset();
    useCoachStore.getState().resetDietGeneration();
    useDietStore.setState({
      plan: null,
      isLoading: false,
      error: null,
      todayStatus: { hasActiveDiet: true, dayMissing: true, resumableJobId: 'j1' },
    } as never);
  });

  it('sem falha conhecida mostra o texto padrão', () => {
    const { getByText } = render(<DietPlanSection />);
    expect(getByText(/A geração parou antes de chegar no dia de hoje/)).toBeTruthy();
  });

  it('job failed (ex.: vindo do boot) mostra o motivo do servidor', () => {
    useCoachStore.setState({
      activeJobId: 'j1',
      dietJob: {
        status: 'failed',
        daysCompleted: 4,
        totalDays: 7,
        slow: false,
        errorMessage: 'Limite diário de IA atingido. Tente amanhã.',
      },
    });
    const { getByText } = render(<DietPlanSection />);
    expect(getByText('Limite diário de IA atingido. Tente amanhã.')).toBeTruthy();
  });

  it('retry que falha aparece na própria aba (não fica calado)', async () => {
    ds().retryJob.mockRejectedValue(new Error('Network Error'));
    const { getByText } = render(<DietPlanSection />);
    await act(async () => {
      fireEvent.press(getByText('Retomar geração'));
    });
    expect(ds().retryJob).toHaveBeenCalledWith('j1');
    expect(getByText('Não foi possível gerar sua dieta agora. Tente novamente.')).toBeTruthy();
  });

  it('com a geração desse job em andamento mostra o progresso', () => {
    useCoachStore.setState({
      activeJobId: 'j1',
      dietJob: {
        status: 'running',
        daysCompleted: 3,
        totalDays: 7,
        slow: false,
        errorMessage: null,
      },
    });
    const { getByText } = render(<DietPlanSection />);
    expect(getByText('Gerando sua dieta — dia 4 de 7…')).toBeTruthy();
  });
});
