import { setupServer } from 'msw/node';
import { authHandlers } from './handlers/auth';
import { foodLogHandlers } from './handlers/food-log';
import { scannerHandlers } from './handlers/scanner';
import { coachHandlers } from './handlers/coach';
import { dietHandlers } from './handlers/diet';

export const server = setupServer(
  ...authHandlers,
  ...foodLogHandlers,
  ...scannerHandlers,
  ...coachHandlers,
  ...dietHandlers,
);

export function startMocks(): void {
  if (__DEV__) {
    server.listen({ onUnhandledRequest: 'warn' });
    console.log('[MSW] Mock server started');
  }
}
