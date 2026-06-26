import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { EvolutionScreen } from './EvolutionScreen';
import { useWeightStore } from '../store';

jest.mock('@shared/services/weight.service', () => ({
  weightService: { getHistory: jest.fn().mockResolvedValue([{ id: '1', date: '2026-06-20', weightKg: 80 }]), addEntry: jest.fn() },
}));
jest.mock('@features/profile/hooks/useProfile', () => ({
  useProfile: () => ({ weeklyData: [], streak: 3, user: { name: 'Ana' }, loading: false, handleLogout: jest.fn() }),
}));

describe('EvolutionScreen', () => {
  beforeEach(() => {
    useWeightStore.setState({ entries: [], isLoading: false, isSaving: false });
    jest.clearAllMocks();
  });

  it('carrega o histórico de peso e mostra o input', async () => {
    const { getByText } = render(<EvolutionScreen />);
    await waitFor(() => expect(getByText('Registrar peso de hoje')).toBeTruthy());
  });
});
