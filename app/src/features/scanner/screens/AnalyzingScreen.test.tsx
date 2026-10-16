import React from 'react';
import { act, render } from '@testing-library/react-native';
import { AnalyzingScreen } from './AnalyzingScreen';
import { useScannerStore } from '../store';

jest.mock('@shared/services/scanner.service', () => ({
  scannerService: { analyzePhoto: jest.fn(), analyzePhotoGuest: jest.fn() },
}));
jest.mock('../components/AnalyzingAnimation', () => ({ AnalyzingAnimation: () => null }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { scannerService } = require('@shared/services/scanner.service');

const item = { id: '1', name: 'Arroz', calories: 200, protein: 4, carbs: 44, fat: 1, confidence: 0.9 };
const navigation = () => ({ replace: jest.fn(), goBack: jest.fn() });
const route = (image: string) => ({ key: 'k', name: 'Analyzing', params: { image } }) as never;

beforeEach(() => {
  jest.clearAllMocks();
  useScannerStore.setState({ image: null, items: [], isAnalyzing: false, error: null });
});

it('fechar o modal no meio da análise (desmontar) libera o scanner para a próxima foto', async () => {
  // 1ª foto: a análise fica pendente e o modal é fechado por gesto.
  scannerService.analyzePhoto.mockReturnValueOnce(new Promise(() => {}));
  const first = render(<AnalyzingScreen navigation={navigation() as never} route={route('foto-1')} />);
  await act(async () => {});
  expect(useScannerStore.getState().isAnalyzing).toBe(true);
  first.unmount();
  expect(useScannerStore.getState().isAnalyzing).toBe(false);

  // 2ª foto: precisa analisar de verdade e navegar para o resultado.
  scannerService.analyzePhoto.mockResolvedValueOnce({ items: [item] });
  const nav = navigation();
  render(<AnalyzingScreen navigation={nav as never} route={route('foto-2')} />);
  await act(async () => {});
  expect(scannerService.analyzePhoto).toHaveBeenCalledTimes(2);
  expect(scannerService.analyzePhoto.mock.calls[1][0]).toBe('foto-2');
  expect(nav.replace).toHaveBeenCalledWith('ScanResult');
});

it('desmontar depois de concluir (ir ao resultado) não cancela nada', async () => {
  scannerService.analyzePhoto.mockResolvedValueOnce({ items: [item] });
  const nav = navigation();
  const screen = render(<AnalyzingScreen navigation={nav as never} route={route('foto')} />);
  await act(async () => {});
  expect(nav.replace).toHaveBeenCalledWith('ScanResult');
  screen.unmount();
  expect(useScannerStore.getState().error).toBeNull();
  expect(useScannerStore.getState().items).toEqual([item]);
});
