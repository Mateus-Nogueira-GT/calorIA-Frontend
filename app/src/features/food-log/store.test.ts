import { describe, it, expect, beforeEach } from '@jest/globals';
import { useFoodLogStore } from './store';
import { todayString } from '@shared/utils/date';

const meal1 = { id: 'm1', name: 'Frango', calories: 450, protein: 38, carbs: 52, fat: 8, loggedAt: new Date().toISOString(), mealType: 'other' as const };
const meal2 = { id: 'm2', name: 'Salada', calories: 280, protein: 30, carbs: 12, fat: 10, loggedAt: new Date().toISOString(), mealType: 'other' as const };

beforeEach(() => {
  useFoodLogStore.setState({ mealsByDate: {}, syncedDates: {}, loadingByDate: {}, selectedDate: '2026-06-09' });
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

  it('setLoading atualiza o loading por data', () => {
    useFoodLogStore.getState().setLoading('2026-06-09', true);
    expect(useFoodLogStore.getState().loadingByDate['2026-06-09']).toBe(true);
    useFoodLogStore.getState().setLoading('2026-06-09', false);
    expect(useFoodLogStore.getState().loadingByDate['2026-06-09']).toBe(false);
  });

  it('mantem o loading isolado por data', () => {
    useFoodLogStore.getState().setLoading('2026-06-09', true);
    useFoodLogStore.getState().setLoading('2026-06-08', false);

    expect(useFoodLogStore.getState().loadingByDate['2026-06-09']).toBe(true);
    expect(useFoodLogStore.getState().loadingByDate['2026-06-08']).toBe(false);
  });

  it('clear remove o cache e reseta o estado do diario', () => {
    useFoodLogStore.getState().setMeals('2026-06-09', [meal1, meal2]);
    useFoodLogStore.getState().setSelectedDate('2026-06-08');
    useFoodLogStore.getState().setLoading('2026-06-09', true);

    useFoodLogStore.getState().clear();

    expect(useFoodLogStore.getState().mealsByDate).toEqual({});
    expect(useFoodLogStore.getState().loadingByDate).toEqual({});
    expect(useFoodLogStore.getState().selectedDate).toBe(todayString());
  });

  it('setMeals marca o dia como sincronizado', () => {
    useFoodLogStore.getState().setMeals('2026-06-09', [meal1]);
    expect(useFoodLogStore.getState().syncedDates['2026-06-09']).toBe(true);
  });

  it('addMeal NÃO marca o dia como sincronizado (M2)', () => {
    // O scanner escreve por aqui. Se isso contasse como sincronizado, o dia
    // ficaria preso com um item só e as refeições já salvas no servidor
    // sumiriam da tela até reiniciar o app.
    useFoodLogStore.getState().addMeal('2026-06-09', meal2);
    expect(useFoodLogStore.getState().mealsByDate['2026-06-09']).toHaveLength(1);
    expect(useFoodLogStore.getState().syncedDates['2026-06-09']).toBeUndefined();
  });
});