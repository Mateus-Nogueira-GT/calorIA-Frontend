import { checkAgainstGoals, mealLimitMessage } from './meal-limits';

const goals = { calories: 1695, protein: 167, carbs: 148, fat: 47 };
const meal = (calories: number, extra: Partial<Record<'protein' | 'carbs' | 'fat', number>> = {}) => ({
  calories,
  protein: 10,
  carbs: 10,
  fat: 5,
  ...extra,
});

describe('checkAgainstGoals', () => {
  it('sem meta de calorias não avisa', () => {
    expect(
      checkAgainstGoals(meal(4000), { calories: 0 }, { ...goals, calories: null }),
    ).toBeNull();
  });

  it('refeição comum não avisa', () => {
    expect(checkAgainstGoals(meal(500), { calories: 600 }, goals)).toBeNull();
  });

  it('refeição sozinha acima de 60% da meta avisa', () => {
    expect(checkAgainstGoals(meal(1200), { calories: 0 }, goals)).toEqual({
      dayCalories: 1200,
      dayPercent: 71,
      calorieGoal: 1695,
    });
  });

  it('exatamente 60% da meta não avisa', () => {
    expect(checkAgainstGoals(meal(1017), { calories: 0 }, goals)).toBeNull();
  });

  it('dia acima de 150% da meta avisa mesmo com refeição pequena', () => {
    const w = checkAgainstGoals(meal(400), { calories: 2300 }, goals);
    expect(w?.dayPercent).toBe(159);
  });

  it('macro sozinho acima da meta do macro avisa', () => {
    expect(checkAgainstGoals(meal(300, { protein: 170 }), { calories: 0 }, goals)).not.toBeNull();
  });

  it('macro sem meta é ignorado', () => {
    expect(
      checkAgainstGoals(meal(300, { protein: 170 }), { calories: 0 }, { ...goals, protein: null }),
    ).toBeNull();
  });
});

describe('mealLimitMessage', () => {
  it('formata com separador de milhar e unidade', () => {
    expect(mealLimitMessage('calories')).toBe('Máximo de 5.000 kcal por refeição');
    expect(mealLimitMessage('fiber')).toBe('Máximo de 150 g por refeição');
  });
});
