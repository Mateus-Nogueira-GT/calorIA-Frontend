import { http, HttpResponse } from 'msw';

const mockMeals = [
  {
    id: 'meal-1',
    name: 'Frango grelhado com arroz',
    calories: 450,
    protein: 38,
    carbs: 52,
    fat: 8,
    loggedAt: new Date().toISOString(),
  },
  {
    id: 'meal-2',
    name: 'Salada verde com atum',
    calories: 280,
    protein: 30,
    carbs: 12,
    fat: 10,
    loggedAt: new Date().toISOString(),
  },
];

export const foodLogHandlers = [
  http.get('*/food-log', () => {
    return HttpResponse.json(mockMeals);
  }),

  http.post('*/food-log', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({
      id: `meal-${Date.now()}`,
      ...body,
      loggedAt: new Date().toISOString(),
    });
  }),

  http.delete('*/food-log/:id', ({ params }) => {
    return HttpResponse.json({ id: params.id, deleted: true });
  }),
];
