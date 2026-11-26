import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useNotificationsStore } from './store';
import { useAuthStore } from '@features/auth/store';
import type { AppNotification } from '@shared/services/notifications.service';

const notif = (id: string, read = false): AppNotification => ({
  id,
  type: 'like',
  actor: { id: 'u1', name: 'Ana' },
  message: 'curtiu seu post',
  targetId: 'p1',
  read,
  createdAt: '2026-06-24T10:00:00Z',
});

jest.mock('@shared/services/notifications.service', () => ({
  notificationsService: {
    getNotifications: jest.fn(),
    markRead: jest.fn(),
  },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { notificationsService } = require('@shared/services/notifications.service');

describe('useNotificationsStore', () => {
  beforeEach(() => {
    useNotificationsStore.setState({ items: [], unreadCount: 0, isLoading: false });
    jest.clearAllMocks();
  });

  it('load popula items e unreadCount', async () => {
    notificationsService.getNotifications.mockResolvedValue({ items: [notif('n1'), notif('n2', true)], unreadCount: 1 });
    const { result } = renderHook(() => useNotificationsStore());
    await act(() => result.current.load());
    expect(result.current.items).toHaveLength(2);
    expect(result.current.unreadCount).toBe(1);
  });

  it('markAllRead otimista zera unreadCount e marca todos lidos', async () => {
    useNotificationsStore.setState({ items: [notif('n1'), notif('n2')], unreadCount: 2 });
    notificationsService.markRead.mockResolvedValue({ unreadCount: 0 });
    const { result } = renderHook(() => useNotificationsStore());
    await act(() => result.current.markAllRead());
    expect(result.current.unreadCount).toBe(0);
    expect(result.current.items.every((n) => n.read)).toBe(true);
  });

  it('markRead marca um item e decrementa unreadCount', async () => {
    useNotificationsStore.setState({ items: [notif('n1'), notif('n2')], unreadCount: 2 });
    notificationsService.markRead.mockResolvedValue({ unreadCount: 1 });
    const { result } = renderHook(() => useNotificationsStore());
    await act(() => result.current.markRead('n1'));
    expect(result.current.items.find((n) => n.id === 'n1')?.read).toBe(true);
    expect(result.current.unreadCount).toBe(1);
  });

  it('markRead é no-op se item já está lido', async () => {
    useNotificationsStore.setState({ items: [notif('n1', true)], unreadCount: 0 });
    const { result } = renderHook(() => useNotificationsStore());
    await act(() => result.current.markRead('n1'));
    expect(notificationsService.markRead).not.toHaveBeenCalled();
  });

  it('clear zera o estado', () => {
    useNotificationsStore.setState({ items: [notif('n1')], unreadCount: 1 });
    useNotificationsStore.getState().clear();
    expect(useNotificationsStore.getState().items).toEqual([]);
    expect(useNotificationsStore.getState().unreadCount).toBe(0);
  });

  describe('R7: troca de sessão', () => {
    const logout = () => {
      useNotificationsStore.getState().clear();
      useAuthStore.setState((st) => ({
        sessionGeneration: st.sessionGeneration + 1,
        user: { id: 'b', name: 'Bia', email: 'bia@example.test' },
      }));
    };
    beforeEach(() => {
      useAuthStore.setState({
        sessionGeneration: 1,
        isAuthenticated: true,
        user: { id: 'a', name: 'Ana', email: 'ana@example.test' },
      });
    });

    it('load pendente na troca de sessão não repovoa a conta seguinte', async () => {
      let resolve!: (v: unknown) => void;
      notificationsService.getNotifications.mockImplementationOnce(
        () => new Promise((r) => (resolve = r)),
      );
      const p = useNotificationsStore.getState().load();
      logout();
      resolve({ items: [notif('n1')], unreadCount: 7 });
      await p;
      expect(useNotificationsStore.getState().items).toEqual([]);
      expect(useNotificationsStore.getState().unreadCount).toBe(0);
    });

    it('markAllRead que falha depois da troca de sessão não restaura o snapshot', async () => {
      useNotificationsStore.setState({ items: [notif('n1')], unreadCount: 3 });
      let reject!: (e: unknown) => void;
      notificationsService.markRead.mockImplementationOnce(
        () => new Promise((_r, j) => (reject = j)),
      );
      const p = useNotificationsStore.getState().markAllRead();
      logout();
      reject(new Error('401'));
      await p;
      expect(useNotificationsStore.getState().items).toEqual([]);
      expect(useNotificationsStore.getState().unreadCount).toBe(0);
    });

    it('load pendente durante o clear() não repovoa a lista', async () => {
      let resolve!: (v: unknown) => void;
      notificationsService.getNotifications.mockImplementationOnce(
        () => new Promise((r) => (resolve = r)),
      );
      const p = useNotificationsStore.getState().load();
      useNotificationsStore.getState().clear();
      resolve({ items: [notif('n1')], unreadCount: 7 });
      await p;
      expect(useNotificationsStore.getState().items).toEqual([]);
      expect(useNotificationsStore.getState().unreadCount).toBe(0);
    });

    it('markAllRead que falha depois do clear() não restaura o snapshot', async () => {
      useNotificationsStore.setState({ items: [notif('n1')], unreadCount: 3 });
      let reject!: (e: unknown) => void;
      notificationsService.markRead.mockImplementationOnce(
        () => new Promise((_r, j) => (reject = j)),
      );
      const p = useNotificationsStore.getState().markAllRead();
      useNotificationsStore.getState().clear();
      reject(new Error('401'));
      await p;
      expect(useNotificationsStore.getState().items).toEqual([]);
      expect(useNotificationsStore.getState().unreadCount).toBe(0);
    });

    it('markRead que responde depois da troca de sessão não mexe no contador', async () => {
      useNotificationsStore.setState({ items: [notif('n1')], unreadCount: 3 });
      let resolve!: (v: unknown) => void;
      notificationsService.markRead.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
      const p = useNotificationsStore.getState().markRead('n1');
      logout();
      resolve({ unreadCount: 2 });
      await p;
      expect(useNotificationsStore.getState().unreadCount).toBe(0);
    });
  });
});
