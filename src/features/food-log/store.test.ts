import { useFoodLogStore } from './store';

const meal1 = { id: 'm1', name: 'Frango', calories: 450, protein: 38, carbs: 52, fat: 8, loggedAt: new Date().toISOString() };
const meal2 = { id: 'm2', name: 'Salada', calories: 280, protein: 30, carbs: 12, fat: 10, loggedAt: new Date().toISOString() };

beforeEach(() => {
  useFoodLogStore.setState({ mealsByDate: {}, selectedDate: '2026-06-09', isLoading: false });
});

describe('useFoodLogStore', () => {
  it('setMeals popula a data correta', () => {
    useFoodLogStore.getState().setMeals('2026-06-09', [meal1]);
    expect(useFoodLogStore.getState().mealsByDate['2026-06-09']).toHaveLength(1);
  });

  it('addMeal adiciona à data correta', () => {
    useFoodLogStore.getState().setMeals('2026-06-09', [meal1]);
    useFoodLogStore.getState().addMeal('2026-06-09', meal2);
    expect(useFoodLogStore.getState().mealsByDate['2026-06-09']).toHaveLength(2);
  });

  it('removeMeal remove pelo id', () => {
    useFoodLogStore.getState().setMeals('2026-06-09', [meal1, meal2]);
    useFoodLogStore.getState().removeMeal('2026-06-09', 'm1');
    const meals = useFoodLogStore.getState().mealsByDate['2026-06-09'];
    expect(meals).toHaveLength(1);
    expect(meals[0].id).toBe('m2');
  });

  it('setSelectedDate atualiza a data selecionada', () => {
    useFoodLogStore.getState().setSelectedDate('2026-06-08');
    expect(useFoodLogStore.getState().selectedDate).toBe('2026-06-08');
  });

  it('setLoading atualiza isLoading', () => {
    useFoodLogStore.getState().setLoading(true);
    expect(useFoodLogStore.getState().isLoading).toBe(true);
    useFoodLogStore.getState().setLoading(false);
    expect(useFoodLogStore.getState().isLoading).toBe(false);
  });
});
