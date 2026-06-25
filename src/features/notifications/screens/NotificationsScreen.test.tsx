import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { NotificationsScreen } from './NotificationsScreen';
import { useNotificationsStore } from '../store';
import type { AppNotification } from '@shared/services/notifications.service';

jest.mock('@shared/services/notifications.service', () => ({
  notificationsService: { getNotifications: jest.fn(), markRead: jest.fn() },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { notificationsService } = require('@shared/services/notifications.service');

const items: AppNotification[] = [
  { id: 'n1', type: 'like', actor: { id: 'u1', name: 'Ana' }, message: 'curtiu seu post', targetId: 'p1', read: false, createdAt: new Date().toISOString() },
];
const navigation = { navigate: jest.fn() } as never;

describe('NotificationsScreen', () => {
  beforeEach(() => {
    useNotificationsStore.getState().clear();
    jest.clearAllMocks();
  });

  it('carrega e lista notificações', async () => {
    notificationsService.getNotifications.mockResolvedValue({ items, unreadCount: 1 });
    const { getByText } = render(<NotificationsScreen navigation={navigation} route={{ key: 'k', name: 'Notifications' } as never} />);
    await waitFor(() => expect(getByText(/curtiu seu post/)).toBeTruthy());
  });

  it('botão marca todas como lidas', async () => {
    notificationsService.getNotifications.mockResolvedValue({ items, unreadCount: 1 });
    notificationsService.markRead.mockResolvedValue({ unreadCount: 0 });
    const { getByText } = render(<NotificationsScreen navigation={navigation} route={{ key: 'k', name: 'Notifications' } as never} />);
    await waitFor(() => expect(getByText(/curtiu seu post/)).toBeTruthy());
    fireEvent.press(getByText('Marcar todas como lidas'));
    await waitFor(() => expect(notificationsService.markRead).toHaveBeenCalled());
  });

  it('ao tocar uma notificação, marca como lida e navega pelo alvo', async () => {
    notificationsService.getNotifications.mockResolvedValue({ items, unreadCount: 1 });
    notificationsService.markRead.mockResolvedValue({ unreadCount: 0 });
    const { getByTestId } = render(<NotificationsScreen navigation={navigation} route={{ key: 'k', name: 'Notifications' } as never} />);
    await waitFor(() => expect(getByTestId('notification-row')).toBeTruthy());
    fireEvent.press(getByTestId('notification-row'));
    const nav = navigation as unknown as { navigate: (screen: string, params: object) => void };
    expect(nav.navigate).toHaveBeenCalledWith('PostComments', { postId: 'p1' });
    await waitFor(() => expect(notificationsService.markRead).toHaveBeenCalledWith(['n1']));
  });
});
