import { http, HttpResponse } from 'msw';

interface PlannedMeal {
  id: string;
  type: 'breakfast' | 'lunch' | 'snack' | 'dinner';
  title: string;
  suggestedTime: string;
  items: { name: string; quantity: number; unit: string; calories: number }[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  completedAt: string | null;
}

interface DietPlan {
  id: string;
  date: string;
  meals: PlannedMeal[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  generatedAt: string;
}

let currentPlan: DietPlan | null = null;

function buildSamplePlan(): DietPlan {
  const meals: PlannedMeal[] = [
    {
      id: 'meal-bf',
      type: 'breakfast',
      title: 'Café da manhã',
      suggestedTime: '08:00',
      items: [
        { name: 'Ovos mexidos', quantity: 2, unit: 'un', calories: 140 },
        { name: 'Pão integral', quantity: 1, unit: 'fatia', calories: 80 },
        { name: 'Banana', quantity: 1, unit: 'un', calories: 105 },
      ],
      calories: 420, protein: 22, carbs: 48, fat: 12, completedAt: null,
    },
    {
      id: 'meal-lc',
      type: 'lunch',
      title: 'Almoço',
      suggestedTime: '12:30',
      items: [
        { name: 'Peito de frango grelhado', quantity: 150, unit: 'g', calories: 240 },
        { name: 'Arroz integral', quantity: 1, unit: 'xíc', calories: 215 },
        { name: 'Salada com azeite', quantity: 1, unit: 'porção', calories: 110 },
        { name: 'Feijão', quantity: 0.5, unit: 'xíc', calories: 115 },
      ],
      calories: 680, protein: 45, carbs: 70, fat: 18, completedAt: null,
    },
    {
      id: 'meal-sn',
      type: 'snack',
      title: 'Lanche',
      suggestedTime: '16:00',
      items: [
        { name: 'Iogurte natural', quantity: 1, unit: 'pote', calories: 120 },
        { name: 'Maçã', quantity: 1, unit: 'un', calories: 100 },
      ],
      calories: 220, protein: 8, carbs: 32, fat: 6, completedAt: null,
    },
    {
      id: 'meal-dn',
      type: 'dinner',
      title: 'Jantar',
      suggestedTime: '19:30',
      items: [
        { name: 'Salmão grelhado', quantity: 150, unit: 'g', calories: 280 },
        { name: 'Batata-doce assada', quantity: 200, unit: 'g', calories: 180 },
        { name: 'Brócolis no vapor', quantity: 1, unit: 'porção', calories: 120 },
      ],
      calories: 580, protein: 40, carbs: 55, fat: 16, completedAt: null,
    },
  ];
  return {
    id: `diet-${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    meals,
    totalCalories: 1900,
    totalProtein: 115,
    totalCarbs: 205,
    totalFat: 52,
    generatedAt: new Date().toISOString(),
  };
}

export const dietHandlers = [
  http.get('*/diet/current', () => HttpResponse.json(currentPlan)),

  http.post('*/diet/generate', () => {
    currentPlan = buildSamplePlan();
    return HttpResponse.json(currentPlan);
  }),

  http.patch('*/diet/meals/:mealId/complete', ({ params }) => {
    if (!currentPlan) return new HttpResponse(null, { status: 404 });
    const meal = currentPlan.meals.find((m) => m.id === params.mealId);
    if (!meal) return new HttpResponse(null, { status: 404 });
    meal.completedAt = new Date().toISOString();
    return HttpResponse.json(meal);
  }),

  http.patch('*/diet/meals/:mealId/uncomplete', ({ params }) => {
    if (!currentPlan) return new HttpResponse(null, { status: 404 });
    const meal = currentPlan.meals.find((m) => m.id === params.mealId);
    if (!meal) return new HttpResponse(null, { status: 404 });
    meal.completedAt = null;
    return HttpResponse.json(meal);
  }),
];
