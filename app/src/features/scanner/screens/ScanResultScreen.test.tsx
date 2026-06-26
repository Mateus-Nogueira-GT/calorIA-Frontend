import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ScanResultScreen } from './ScanResultScreen';
import { useScannerStore } from '../store';

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
    const { getByDisplayValue } = render(<ScanResultScreen navigation={navigation} route={{ key: 'k', name: 'ScanResult' } as never} />);
    expect(getByDisplayValue('Arroz')).toBeTruthy();
  });

  it('confirmar adiciona ao diário', async () => {
    const { getByText } = render(<ScanResultScreen navigation={navigation} route={{ key: 'k', name: 'ScanResult' } as never} />);
    fireEvent.press(getByText('Confirmar e adicionar ao diário'));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { foodLogService } = require('@shared/services/food-log.service');
    await waitFor(() => expect(foodLogService.addMeal).toHaveBeenCalled());
  });
});
