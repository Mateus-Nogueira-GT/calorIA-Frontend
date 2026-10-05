export type BodyTypeKey = 'ectomorph' | 'mesomorph' | 'endomorph';

export const BODY_TYPE_LABELS: Record<BodyTypeKey, string> = {
  ectomorph: 'Magro / Acelerado (Ectomorfo)',
  mesomorph: 'Atlético / Versátil (Mesomorfo)',
  endomorph: 'Largo (Endomorfo)',
};

export type QuizQuestion = {
  question: string;
  options: { value: BodyTypeKey; emoji: string; title: string; description: string }[];
};

export const BODY_TYPE_QUIZ: QuizQuestion[] = [
  {
    question: 'Envolva o pulso com o polegar e o dedo médio da outra mão. O que acontece?',
    options: [
      { value: 'ectomorph', emoji: '👌', title: 'Os dedos se sobrepõem', description: 'Sobra espaço' },
      { value: 'mesomorph', emoji: '🤏', title: 'Os dedos só se encostam', description: 'Fecha certinho' },
      { value: 'endomorph', emoji: '✋', title: 'Os dedos não se encostam', description: 'Não fecha' },
    ],
  },
  {
    question: 'Como seu peso costuma reagir quando você come mais que o normal?',
    options: [
      { value: 'ectomorph', emoji: '🪶', title: 'Quase não muda', description: 'Tenho dificuldade de ganhar peso' },
      { value: 'mesomorph', emoji: '⚖️', title: 'Muda um pouco', description: 'Ganho, mas perco fácil também' },
      { value: 'endomorph', emoji: '📈', title: 'Sobe rápido', description: 'Ganho peso com facilidade' },
    ],
  },
  {
    question: 'Qual dessas descrições combina mais com o seu corpo?',
    options: [
      { value: 'ectomorph', emoji: '📏', title: 'Magro e alongado', description: 'Ombros e quadril estreitos' },
      { value: 'mesomorph', emoji: '💪', title: 'Atlético', description: 'Ganho músculo com facilidade' },
      { value: 'endomorph', emoji: '🧱', title: 'Mais largo e arredondado', description: 'Acumulo gordura na barriga/quadril' },
    ],
  },
];

/** Maioria simples; empate (ou sem respostas) cai em mesomorfo, o meio-termo. */
export function scoreBodyType(answers: BodyTypeKey[]): BodyTypeKey {
  const count: Record<BodyTypeKey, number> = { ectomorph: 0, mesomorph: 0, endomorph: 0 };
  for (const a of answers) count[a] += 1;
  const max = Math.max(count.ectomorph, count.mesomorph, count.endomorph);
  const winners = (Object.keys(count) as BodyTypeKey[]).filter((k) => count[k] === max);
  return winners.length === 1 ? winners[0] : 'mesomorph';
}
