import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { NotificationRow } from './NotificationRow';
import type { AppNotification } from '@shared/services/notifications.service';

const notif = (read: boolean): AppNotification => ({
  id: 'n1',
  type: 'like',
  actor: { id: 'u1', name: 'Ana', avatarEmoji: '🦊' },
  message: 'curtiu seu post',
  targetId: 'p1',
  read,
  createdAt: new Date().toISOString(),
});

describe('NotificationRow', () => {
  it('mostra ator + mensagem e dispara onPress', () => {
    const onPress = jest.fn();
    const { getByText, getByTestId } = render(<NotificationRow notification={notif(false)} onPress={onPress} />);
    expect(getByText(/Ana/)).toBeTruthy();
    expect(getByText(/curtiu seu post/)).toBeTruthy();
    fireEvent.press(getByTestId('notification-row'));
    expect(onPress).toHaveBeenCalled();
  });

  it('sinaliza não-lida via accessibilityState', () => {
    const { getByTestId } = render(<NotificationRow notification={notif(false)} onPress={() => {}} />);
    expect(getByTestId('notification-row').props.accessibilityState.selected).toBe(true);
  });
});
