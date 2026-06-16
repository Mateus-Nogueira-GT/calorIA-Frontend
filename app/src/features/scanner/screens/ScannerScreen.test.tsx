import React from 'react';
import { render } from '@testing-library/react-native';
import { ScannerScreen } from './ScannerScreen';

jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn() }) }));
jest.mock('@shared/services/scanner.service', () => ({
  scannerService: { analyzePhoto: jest.fn().mockResolvedValue({ name: 'Maçã', calories: 95, protein: 0.5, carbs: 25, fat: 0.3, confidence: 0.92 }) },
}));
jest.mock('@shared/services/food-log.service', () => ({
  foodLogService: { addMeal: jest.fn().mockResolvedValue({ id: 'x', name: 'Maçã', calories: 95, protein: 0.5, carbs: 25, fat: 0.3, loggedAt: new Date().toISOString() }) },
}));

describe('ScannerScreen', () => {
  it('renderiza título e viewfinder', () => {
    const { getByText, getByTestId } = render(<ScannerScreen />);
    expect(getByText('Scanner de alimentos')).toBeTruthy();
    expect(getByTestId('scanner-viewfinder')).toBeTruthy();
  });
});
