import { http, HttpResponse } from 'msw';

const mockHistory = [
  {
    id: 'msg-1',
    role: 'coach' as const,
    content: 'Olá! Sou o seu coach de nutrição. Como posso ajudar você hoje?',
    timestamp: new Date().toISOString(),
  },
];

export const coachHandlers = [
  http.get('*/coach/history', () => HttpResponse.json(mockHistory)),

  http.post('*/coach/message', async ({ request }) => {
    const body = await request.json() as { content: string };
    return HttpResponse.json({
      id: `msg-${Date.now()}`,
      role: 'coach',
      content: `Entendido! Você disse: "${body.content}". Vou analisar e te dar uma resposta personalizada.`,
      timestamp: new Date().toISOString(),
    });
  }),
];
