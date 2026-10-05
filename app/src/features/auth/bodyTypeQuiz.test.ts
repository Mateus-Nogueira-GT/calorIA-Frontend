import { BODY_TYPE_QUIZ, BODY_TYPE_LABELS, scoreBodyType } from './bodyTypeQuiz';

describe('scoreBodyType', () => {
  it('maioria vence', () => {
    expect(scoreBodyType(['ectomorph', 'ectomorph', 'endomorph'])).toBe('ectomorph');
    expect(scoreBodyType(['endomorph', 'mesomorph', 'endomorph'])).toBe('endomorph');
  });
  it('empate ou vazio → mesomorph', () => {
    expect(scoreBodyType(['ectomorph', 'mesomorph', 'endomorph'])).toBe('mesomorph');
    expect(scoreBodyType([])).toBe('mesomorph');
  });
  it('quiz tem 3 perguntas, cada uma com uma opção por biotipo', () => {
    expect(BODY_TYPE_QUIZ).toHaveLength(3);
    for (const q of BODY_TYPE_QUIZ) {
      expect(q.options.map((o) => o.value).sort()).toEqual(['ectomorph', 'endomorph', 'mesomorph']);
    }
  });
  it('labels leigos', () => {
    expect(BODY_TYPE_LABELS.mesomorph).toBe('Atlético / Versátil (Mesomorfo)');
  });
});
