import { correctionDraft } from './correction-draft';

const meal = {
  id: 'm1', name: 'Carne suína grelhada', calories: 420, protein: 38, carbs: 0, fat: 29,
  loggedAt: '2026-11-03 23:14:00+00', mealType: 'dinner' as const,
};

describe('correctionDraft', () => {
  it('com peso: nome e gramas, terminando para o usuário completar', () => {
    expect(correctionDraft({ ...meal, weightGrams: 180 })).toBe(
      'Corrigir o registro "Carne suína grelhada" (180 g): na verdade era ',
    );
  });
  it('sem peso: só o nome', () => {
    expect(correctionDraft(meal)).toBe('Corrigir o registro "Carne suína grelhada": na verdade era ');
  });
});
