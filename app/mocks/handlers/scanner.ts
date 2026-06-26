import { http, HttpResponse } from 'msw';

export const scannerHandlers = [
  http.post('*/scanner/analyze', () =>
    HttpResponse.json({
      items: [
        { id: 's1', name: 'Arroz branco', calories: 205, protein: 4, carbs: 45, fat: 0, confidence: 0.92 },
        { id: 's2', name: 'Peito de frango', calories: 165, protein: 31, carbs: 0, fat: 4, confidence: 0.88 },
        { id: 's3', name: 'Brócolis', calories: 55, protein: 4, carbs: 11, fat: 1, confidence: 0.7 },
      ],
    }),
  ),

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
