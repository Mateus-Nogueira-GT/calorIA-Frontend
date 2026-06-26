import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AppState } from 'react-native';
import { renderHook } from '@testing-library/react-native';
import { useNotificationPolling } from './useNotificationPolling';
import { useAuthStore } from '@features/auth/store';

jest.mock('@shared/services/notifications.service', () => ({
  notificationsService: { getNotifications: jest.fn(), markRead: jest.fn() },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { notificationsService } = require('@shared/services/notifications.service');

describe('useNotificationPolling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    notificationsService.getNotifications.mockResolvedValue({ items: [], unreadCount: 0 });
    useAuthStore.setState({ isAuthenticated: true } as never);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('busca imediatamente ao montar quando autenticado', () => {
    renderHook(() => useNotificationPolling());
    expect(notificationsService.getNotifications).toHaveBeenCalledTimes(1);
  });

  it('busca de novo após o intervalo', () => {
    renderHook(() => useNotificationPolling());
    jest.advanceTimersByTime(45_000);
    expect(notificationsService.getNotifications).toHaveBeenCalledTimes(2);
  });

  it('não busca quando não autenticado', () => {
    useAuthStore.setState({ isAuthenticated: false } as never);
    renderHook(() => useNotificationPolling());
    expect(notificationsService.getNotifications).not.toHaveBeenCalled();
  });

  it('busca de novo quando o app volta para foreground (AppState active)', () => {
    const handlers: Array<(s: string) => void> = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, cb) => {
      handlers.push(cb as (s: string) => void);
      return { remove: jest.fn() } as never;
    });
    renderHook(() => useNotificationPolling());
    expect(notificationsService.getNotifications).toHaveBeenCalledTimes(1);
    handlers.forEach((cb) => cb('active'));
    expect(notificationsService.getNotifications).toHaveBeenCalledTimes(2);
  });

  it('limpa intervalo e listener ao desmontar', () => {
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove } as never);
    const { unmount } = renderHook(() => useNotificationPolling());
    unmount();
    expect(remove).toHaveBeenCalled();
    jest.advanceTimersByTime(45_000);
    expect(notificationsService.getNotifications).toHaveBeenCalledTimes(1);
  });
});
