const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function dateToString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayString(): string {
  return dateToString(new Date());
}

export function last7Days(): string[] {
  const now = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    return dateToString(d);
  });
}

export function formatChipLabel(dateStr: string): string {
  const today = todayString();
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yesterday = dateToString(d);
  if (dateStr === today) return 'Hoje';
  if (dateStr === yesterday) return 'Ontem';
  const dateObj = new Date(dateStr + 'T00:00:00');
  return `${dateObj.getDate()} ${MONTHS[dateObj.getMonth()]}`;
}

export type MealGroup = 'Café da manhã' | 'Almoço' | 'Lanche' | 'Jantar';

export function getMealGroup(loggedAt: string): MealGroup {
  const hour = new Date(loggedAt).getHours();
  if (hour >= 5 && hour < 11) return 'Café da manhã';
  if (hour >= 11 && hour < 15) return 'Almoço';
  if (hour >= 15 && hour < 18) return 'Lanche';
  return 'Jantar';
}
