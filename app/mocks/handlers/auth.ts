import { http, HttpResponse } from 'msw';

export const authHandlers = [
  http.post('*/auth/login', async ({ request }) => {
    const body = await request.json() as { email: string; password: string };
    return HttpResponse.json({
      token: 'mock-jwt-token-12345',
      user: {
        id: 'user-1',
        name: 'Test User',
        email: body.email,
      },
    });
  }),

  http.post('*/auth/register', async ({ request }) => {
    const body = await request.json() as { name: string; email: string; password: string };
    return HttpResponse.json({
      token: 'mock-jwt-token-new-user',
      user: {
        id: 'user-2',
        name: body.name,
        email: body.email,
      },
    });
  }),

  http.post('*/auth/logout', () => {
    return HttpResponse.json({ success: true });
  }),
];
