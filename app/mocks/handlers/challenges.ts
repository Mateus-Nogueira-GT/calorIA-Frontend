import { http, HttpResponse } from 'msw';

interface PostAuthor {
  id: string;
  name: string;
  avatarEmoji?: string;
}
interface Challenge {
  id: string;
  title: string;
  description: string;
  emoji: string;
  startDate: string;
  endDate: string;
  participantCount: number;
  metric: 'streak';
  joinedByMe: boolean;
  inviteCode: string;
}
interface LeaderboardEntry {
  rank: number;
  user: PostAuthor;
  streak: number;
  isMe: boolean;
}

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

let challenges: Challenge[] = [
  {
    id: 'ch1',
    title: 'Sequência de 7 dias',
    description: 'Registre todas as refeições por 7 dias seguidos.',
    emoji: '🔥',
    startDate: isoDate(-2),
    endDate: isoDate(5),
    participantCount: 4,
    metric: 'streak',
    joinedByMe: true,
    inviteCode: 'STREAK7',
  },
  {
    id: 'ch2',
    title: 'Hidratação total',
    description: 'Bata a meta de água todos os dias da semana.',
    emoji: '💧',
    startDate: isoDate(0),
    endDate: isoDate(7),
    participantCount: 2,
    metric: 'streak',
    joinedByMe: false,
    inviteCode: 'AGUA',
  },
];

const leaderboards: Record<string, LeaderboardEntry[]> = {
  ch1: [
    { rank: 1, user: { id: 'u1', name: 'Ana Souza', avatarEmoji: '🦊' }, streak: 7, isMe: false },
    { rank: 2, user: { id: 'me', name: 'Você', avatarEmoji: '😎' }, streak: 5, isMe: true },
    { rank: 3, user: { id: 'u2', name: 'Bruno Lima', avatarEmoji: '🐻' }, streak: 4, isMe: false },
  ],
};

let seq = 10;

export const challengesHandlers = [
  http.get('*/challenges', () => HttpResponse.json(challenges)),

  http.post('*/challenges', async ({ request }) => {
    const body = (await request.json()) as { title: string; description: string; startDate: string; endDate: string };
    const id = `ch-${seq++}`;
    const created: Challenge = {
      id,
      title: body.title,
      description: body.description,
      emoji: '🏆',
      startDate: body.startDate,
      endDate: body.endDate,
      participantCount: 1,
      metric: 'streak',
      joinedByMe: true,
      inviteCode: id.toUpperCase(),
    };
    challenges = [created, ...challenges];
    leaderboards[id] = [{ rank: 1, user: { id: 'me', name: 'Você', avatarEmoji: '😎' }, streak: 0, isMe: true }];
    return HttpResponse.json(created, { status: 201 });
  }),

  http.post('*/challenges/:id/join', ({ params }) => {
    const challenge = challenges.find((c) => c.id === params.id);
    if (!challenge) return new HttpResponse(null, { status: 404 });
    if (!challenge.joinedByMe) {
      challenge.joinedByMe = true;
      challenge.participantCount += 1;
    }
    return HttpResponse.json(challenge);
  }),

  http.get('*/challenges/:id/leaderboard', ({ params }) =>
    HttpResponse.json(leaderboards[params.id as string] ?? []),
  ),

  http.get('*/challenges/invite/:code', ({ params }) => {
    const challenge = challenges.find((c) => c.inviteCode === params.code);
    if (!challenge) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(challenge);
  }),
];
