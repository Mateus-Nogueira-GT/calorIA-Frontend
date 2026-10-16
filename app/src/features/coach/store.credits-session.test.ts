import { useCoachStore } from './store';
import { useAuthStore } from '@features/auth/store';
import { coachService } from '@shared/services/coach.service';
jest.mock('@shared/services/coach.service', () => ({
  coachService: { getHistory: jest.fn(), sendMessage: jest.fn() },
}));
it('does not restore a previous account history after a session switch', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof coachService.getHistory>>) => void;
  jest.mocked(coachService.getHistory).mockImplementation(
    () =>
      new Promise((complete) => {
        resolve = complete;
      }),
  );
  useCoachStore.setState({ conversationId: 'old', messages: [] });
  const request = useCoachStore.getState().loadHistory();
  useAuthStore.setState({ sessionGeneration: useAuthStore.getState().sessionGeneration + 1 });
  useCoachStore.setState({ conversationId: 'new', messages: [] });
  resolve({
    status: 'collecting',
    messages: [
      {
        id: 'old-0',
        role: 'coach',
        content: 'Private old reply',
        timestamp: '2026-10-15T00:00:00Z',
      },
    ],
  });
  await request;
  expect(useCoachStore.getState().messages).toEqual([]);
  expect(useCoachStore.getState().conversationId).toBe('new');
});
it('logout removes conversation identity as well as its visible messages', () => {
  useCoachStore.setState({
    conversationId: 'private-conversation',
    messages: [{ id: 'x', role: 'user', content: 'Private message', timestamp: new Date() }],
  });
  useAuthStore.getState().clearToken();
  expect(useCoachStore.getState().conversationId).toBeNull();
  expect(useCoachStore.getState().messages).toEqual([]);
});
