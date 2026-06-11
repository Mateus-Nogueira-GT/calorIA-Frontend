import { http, HttpResponse } from 'msw';

export const scannerHandlers = [
  http.post('*/scanner/analyze', () => {
    return HttpResponse.json({
      name: 'Maçã',
      calories: 95,
      protein: 0.5,
      carbs: 25,
      fat: 0.3,
      confidence: 0.92,
    });
  }),

  http.get('*/scanner/barcode/:barcode', () => {
    return HttpResponse.json({
      name: 'Produto Mock',
      calories: 200,
      protein: 5,
      carbs: 30,
      fat: 8,
      confidence: 0.98,
    });
  }),
];
