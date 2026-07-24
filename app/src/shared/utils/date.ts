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

/** Dia da semana LOCAL: 1=Segunda … 7=Domingo (contrato dayNumber da API). */
export function todayDayNumber(d: Date = new Date()): number {
  return ((d.getDay() + 6) % 7) + 1;
}

/**
 * Offset do fuso na convenção da API: local = UTC + offset (BRT = -180).
 * É o INVERSO do getTimezoneOffset() do JS.
 */
export function tzOffsetMinutes(d: Date = new Date()): number {
  return -d.getTimezoneOffset();
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

const TYPE_TO_GROUP: Record<string, MealGroup> = {
  breakfast: 'Café da manhã',
  lunch: 'Almoço',
  snack: 'Lanche',
  dinner: 'Jantar',
};

/**
 * Grupo do diário: usa o tipo escolhido pelo usuário quando existir;
 * registros antigos/'other' caem no heurístico por horário.
 */
export function getMealGroupFor(mealType: string | undefined, loggedAt: string): MealGroup {
  return TYPE_TO_GROUP[mealType ?? ''] ?? getMealGroup(loggedAt);
}

export function timeAgo(iso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min}min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days}d`;
}
