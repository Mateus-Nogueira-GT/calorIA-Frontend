import { correctionDraft, mealRef } from './correction-draft';

const meal = {
  id: 'abcdef12-3456-7890-abcd-ef1234567890',
  name: 'Carne suína grelhada',
  calories: 420,
  protein: 38,
  carbs: 0,
  fat: 29,
  loggedAt: '2026-11-03 23:14:00+00',
  mealType: 'dinner' as const,
};

describe('correctionDraft', () => {
  // 05/11 (M6): a ref vai no rascunho — o coach acha o registro mesmo de outro dia.
  it('com peso: nome, gramas, data e ref, terminando para o usuário completar', () => {
    expect(correctionDraft({ ...meal, weightGrams: 180 }, '2026-11-03')).toBe(
      'Corrigir o registro "Carne suína grelhada" (180 g, 03/11 · ref abcdef): na verdade era ',
    );
  });
  it('sem peso: nome, data e ref', () => {
    expect(correctionDraft(meal, '2026-11-03')).toBe(
      'Corrigir o registro "Carne suína grelhada" (03/11 · ref abcdef): na verdade era ',
    );
  });
  it('a ref é a mesma do servidor: 6 primeiros caracteres do id, sem hífens', () => {
    expect(mealRef('0a1b2-c3d4-e5f6')).toBe('0a1b2c');
  });
});
