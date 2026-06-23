import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { ScannerScreen } from './ScannerScreen';
import { useFoodLogStore } from '@features/food-log/store';
import { todayString } from '@shared/utils/date';

// O scanner só é interativo na web; o screen esconde o viewfinder fora dela.
(Platform as { OS: string }).OS = 'web';

const mockNavigate = jest.fn();
const mockAnalyzePhoto = jest.fn().mockResolvedValue({ name: 'Maçã', calories: 95, protein: 0.5, carbs: 25, fat: 0.3, confidence: 0.92 });
const mockAddMeal = jest.fn().mockResolvedValue({ id: 'x', name: 'Maçã', calories: 95, protein: 0.5, carbs: 25, fat: 0.3, loggedAt: new Date().toISOString() });

jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock('@shared/services/scanner.service', () => ({
  scannerService: { analyzePhoto: (...args: unknown[]) => mockAnalyzePhoto(...args) },
}));
jest.mock('@shared/services/food-log.service', () => ({
  foodLogService: { addMeal: (...args: unknown[]) => mockAddMeal(...args) },
}));
jest.mock('../components/ScannerViewfinder', () => {
  const { Button } = require('react-native');

  return {
    ScannerViewfinder: ({ onPickImage }: { onPickImage: (uri: string) => void }) => (
      <Button title="pick-image" onPress={() => onPickImage('mock://image')} testID="scanner-viewfinder" />
    ),
  };
});
jest.mock('../components/ScanResultCard', () => {
  const { View, Button, Text } = require('react-native');

  return {
    ScanResultCard: ({ result, onAdd }: { result: { name: string }; onAdd: () => void }) => (
      <View testID="scan-result-card">
        <Text>{result.name}</Text>
        <Button title="add-to-diary" onPress={onAdd} />
      </View>
    ),
  };
});

beforeEach(() => {
  mockNavigate.mockClear();
  mockAnalyzePhoto.mockClear();
  mockAddMeal.mockClear();
  useFoodLogStore.setState({ mealsByDate: {}, loadingByDate: {}, selectedDate: '2026-06-01' });
});

describe('ScannerScreen', () => {
  it('renderiza título e viewfinder', () => {
    const { getByText, getByTestId } = render(<ScannerScreen />);
    expect(getByText('Scanner de alimentos')).toBeTruthy();
    expect(getByTestId('scanner-viewfinder')).toBeTruthy();
  });

  it('ao adicionar via scanner, abre o diario focado em hoje', async () => {
    const { getByTestId, getByText } = render(<ScannerScreen />);

    fireEvent.press(getByTestId('scanner-viewfinder'));
    await waitFor(() => expect(getByText('Maçã')).toBeTruthy());

    fireEvent.press(getByText('add-to-diary'));

    const today = todayString();

    await waitFor(() => expect(mockAddMeal).toHaveBeenCalled());
    await waitFor(() => expect(useFoodLogStore.getState().selectedDate).toBe(today));
    await waitFor(() =>
      expect(useFoodLogStore.getState().mealsByDate[today]).toEqual([
        expect.objectContaining({ id: 'x', name: 'Maçã' }),
      ]),
    );
    expect(mockNavigate).toHaveBeenCalledWith('FoodLog');
  });
});
