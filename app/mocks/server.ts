import { setupServer } from 'msw/node';
import { authHandlers } from './handlers/auth';
import { foodLogHandlers } from './handlers/food-log';
import { scannerHandlers } from './handlers/scanner';
import { coachHandlers } from './handlers/coach';
import { dietHandlers } from './handlers/diet';
import { weightHandlers } from './handlers/weight';
import { feedHandlers } from './handlers/feed';
import { challengesHandlers } from './handlers/challenges';
import { notificationsHandlers } from './handlers/notifications';

export const server = setupServer(
  ...authHandlers,
  ...foodLogHandlers,
  ...scannerHandlers,
  ...coachHandlers,
  ...dietHandlers,
  ...weightHandlers,
  ...feedHandlers,
  ...challengesHandlers,
  ...notificationsHandlers,
);

export function startMocks(): void {
  if (__DEV__) {
    server.listen({ onUnhandledRequest: 'warn' });
    console.log('[MSW] Mock server started');
  }
}
