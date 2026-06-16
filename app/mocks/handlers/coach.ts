import { http, HttpResponse } from 'msw';

const mockHistory = [
  {
    id: 'msg-1',
    role: 'coach' as const,
    content: 'Olá! Sou o seu coach de nutrição. Como posso ajudar você hoje?',
    timestamp: new Date().toISOString(),
  },
];

const TRIGGER_KEYWORDS = ['gerar dieta', 'pode gerar', 'cria minha dieta', 'fechar dieta'];

export const coachHandlers = [
  http.get('*/coach/history', () => HttpResponse.json(mockHistory)),

  http.post('*/coach/message', async ({ request }) => {
    const body = (await request.json()) as { content: string };
    const lower = body.content.toLowerCase();
    const ready = TRIGGER_KEYWORDS.some((k) => lower.includes(k));
    return HttpResponse.json({
      id: `msg-${Date.now()}`,
      role: 'coach',
      content: ready
        ? 'Perfeito! Coletei tudo que preciso. Toque no botão abaixo pra eu gerar sua dieta personalizada.'
        : `Entendido! Você disse: "${body.content}". Vou analisar e te dar uma resposta personalizada.`,
      timestamp: new Date().toISOString(),
      ...(ready ? { canGenerateDiet: true } : {}),
    });
  }),
];
