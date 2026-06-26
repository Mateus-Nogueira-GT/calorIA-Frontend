import { http, HttpResponse } from 'msw';
import { dateToString } from '@shared/utils/date';

interface WeightEntry { id: string; date: string; weightKg: number; }

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return dateToString(d);
}

let entries: WeightEntry[] = [
  { id: 'w1', date: isoDate(-14), weightKg: 82 },
  { id: 'w2', date: isoDate(-7), weightKg: 81.2 },
  { id: 'w3', date: isoDate(-1), weightKg: 80.5 },
];
let seq = 10;

export const weightHandlers = [
  http.get('*/weight', () => HttpResponse.json([...entries].sort((a, b) => a.date.localeCompare(b.date)))),

  http.post('*/weight', async ({ request }) => {
    const body = (await request.json()) as { weightKg: number; date: string };
    const existing = entries.find((e) => e.date === body.date);
    if (existing) {
      existing.weightKg = body.weightKg;
      return HttpResponse.json(existing);
    }
    const created: WeightEntry = { id: `w-${seq++}`, date: body.date, weightKg: body.weightKg };
    entries = [...entries, created];
    return HttpResponse.json(created, { status: 201 });
  }),
];
