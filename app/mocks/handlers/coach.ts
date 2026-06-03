import { http, HttpResponse } from 'msw';

export const coachHandlers = [
  http.get('*/coach/history/:conversationId', () => {
    return HttpResponse.json([
      {
        id: 'msg-1',
        role: 'assistant',
        content: 'Olá! Sou a calorIA, sua assistente de nutrição com IA. Como posso te ajudar hoje?',
        createdAt: new Date().toISOString(),
      },
    ]);
  }),

  http.post('*/coach/message', async ({ request }) => {
    const body = await request.json() as { message: string };
    return HttpResponse.json({
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: `Recebi sua mensagem: "${body.message}". Esta é uma resposta mock da IA.`,
      createdAt: new Date().toISOString(),
    });
  }),
];
