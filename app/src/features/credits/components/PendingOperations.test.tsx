import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { PendingOperations } from './PendingOperations';
import { useAuthStore } from '@features/auth/store';
import { creditsService } from '@shared/services/credits.service';
import { finishRequest, pendingRequests } from '@shared/services/operation-requests';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('@shared/services/credits.service', () => ({
  ...jest.requireActual('@shared/services/credits.service'),
  creditsService: { operation: jest.fn() },
}));
jest.mock('@shared/services/operation-requests', () => ({
  pendingRequests: jest.fn(),
  finishRequest: jest.fn(),
}));

const photo = { key: 'k-foto', type: 'photo' as const, signature: 's', created_at: '2026-11-25' };

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({
    sessionGeneration: 5,
    isAuthenticated: true,
    user: { id: 'a', name: 'Ana', email: 'ana@example.test' },
  });
  (pendingRequests as jest.Mock).mockResolvedValue([photo]);
  (finishRequest as jest.Mock).mockResolvedValue(undefined);
});

it('R8: recuperar a foto tira o botão "Recuperar" da lista', async () => {
  (creditsService.operation as jest.Mock).mockResolvedValue({
    state: 'succeeded',
    result: { items: [] },
  });
  const screen = render(<PendingOperations />);
  const button = await screen.findByText('Recuperar análise da foto');
  await act(async () => {
    fireEvent.press(button);
  });
  expect(finishRequest).toHaveBeenCalledWith(photo, 'a');
  expect(mockNavigate).toHaveBeenCalledWith('Scanner', { screen: 'ScanResult' });
  expect(screen.queryByText('Recuperar análise da foto')).toBeNull();
});
