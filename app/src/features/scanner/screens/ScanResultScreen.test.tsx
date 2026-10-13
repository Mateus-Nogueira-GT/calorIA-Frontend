import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ScanResultScreen } from './ScanResultScreen';
import { useScannerStore } from '../store';
import { ScannerGuestContext } from '../mode';

jest.mock('@shared/services/scanner.service', () => ({
  scannerService: { analyzePhoto: jest.fn() },
}));
jest.mock('@shared/services/food-log.service', () => ({ foodLogService: { addMeal: jest.fn().mockResolvedValue({}) } }));

const navigation = { navigate: jest.fn(), goBack: jest.fn(), getParent: () => ({ goBack: jest.fn() }) } as never;

describe('ScanResultScreen', () => {
  beforeEach(() => {
    useScannerStore.setState({
      image: 'x',
      items: [{ id: '1', name: 'Arroz', calories: 200, protein: 4, carbs: 44, fat: 1, confidence: 0.9 }],
      isAnalyzing: false,
      error: null,
    });
    jest.clearAllMocks();
  });

  it('renderiza os itens detectados', () => {
    const { getByText } = render(<ScanResultScreen navigation={navigation} route={{ key: 'k', name: 'ScanResult' } as never} />);
    expect(getByText('Arroz')).toBeTruthy();
  });

  it('confirmar adiciona ao diário', async () => {
    const { getByText } = render(<ScanResultScreen navigation={navigation} route={{ key: 'k', name: 'ScanResult' } as never} />);
    fireEvent.press(getByText('Confirmar e adicionar ao diário'));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { foodLogService } = require('@shared/services/food-log.service');
    await waitFor(() => expect(foodLogService.addMeal).toHaveBeenCalled());
  });

  describe('convidado (App Store 5.1.1(v))', () => {
    const parentNavigate = jest.fn();
    const guestNavigation = {
      navigate: jest.fn(),
      goBack: jest.fn(),
      popToTop: jest.fn(),
      getParent: () => ({ goBack: jest.fn(), navigate: parentNavigate }),
    } as never;
    const renderGuest = () =>
      render(
        <ScannerGuestContext.Provider value>
          <ScanResultScreen navigation={guestNavigation} route={{ key: 'k', name: 'ScanResult' } as never} />
        </ScannerGuestContext.Provider>,
      );

    it('mostra o resultado e leva ao cadastro para salvar, sem gravar no diário', () => {
      const { getByText, queryByText } = renderGuest();
      expect(getByText('Arroz')).toBeTruthy();
      expect(queryByText('Confirmar e adicionar ao diário')).toBeNull();

      fireEvent.press(getByText('Criar conta para salvar'));

      expect(parentNavigate).toHaveBeenCalledWith('Register');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { foodLogService } = require('@shared/services/food-log.service');
      expect(foodLogService.addMeal).not.toHaveBeenCalled();
    });
  });
});
