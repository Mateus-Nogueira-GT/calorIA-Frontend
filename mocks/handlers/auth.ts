import { http, HttpResponse } from 'msw';

const mockUser = (name: string, email: string) => ({
  token: 'mock-jwt-token-12345',
  user: { id: 'user-1', name, email },
});

export const authHandlers = [
  http.post('*/auth/login', async ({ request }) => {
    const body = await request.json() as { email: string; password: string };
    if (body.email === 'erro@teste.com') {
      return HttpResponse.json({ message: 'Credenciais inválidas' }, { status: 401 });
    }
    return HttpResponse.json(mockUser('Test User', body.email));
  }),

  http.post('*/auth/register', async ({ request }) => {
    const body = await request.json() as { name: string; email: string };
    return HttpResponse.json(mockUser(body.name, body.email), { status: 201 });
  }),

  http.post('*/auth/google', () =>
    HttpResponse.json(mockUser('Google User', 'google@user.com')),
  ),

  http.post('*/auth/apple', () =>
    HttpResponse.json(mockUser('Apple User', 'apple@user.com')),
  ),

  http.patch('*/auth/profile-setup', () =>
    HttpResponse.json({ success: true }),
  ),

  http.post('*/auth/logout', () =>
    HttpResponse.json({ success: true }),
  ),
];
