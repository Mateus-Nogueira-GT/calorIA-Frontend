import { dateToString, todayString, last7Days, formatChipLabel, getMealGroup } from './date';

describe('dateToString', () => {
  it('formats date as YYYY-MM-DD', () => {
    expect(dateToString(new Date(2026, 5, 9))).toBe('2026-06-09');
  });
});

describe('last7Days', () => {
  it('returns 7 items with today first', () => {
    const days = last7Days();
    expect(days).toHaveLength(7);
    expect(days[0]).toBe(todayString());
  });
});

describe('formatChipLabel', () => {
  it('returns "Hoje" for today', () => {
    expect(formatChipLabel(todayString())).toBe('Hoje');
  });
  it('returns "Ontem" for yesterday', () => {
    const yesterday = dateToString(new Date(Date.now() - 86400000));
    expect(formatChipLabel(yesterday)).toBe('Ontem');
  });
  it('returns "2 Jun" for 2026-06-02', () => {
    expect(formatChipLabel('2026-06-02')).toBe('2 Jun');
  });
});

describe('getMealGroup', () => {
  it('maps 08:00 to Café da manhã', () => {
    expect(getMealGroup(new Date(2026, 5, 9, 8, 0).toISOString())).toBe('Café da manhã');
  });
  it('maps 12:00 to Almoço', () => {
    expect(getMealGroup(new Date(2026, 5, 9, 12, 0).toISOString())).toBe('Almoço');
  });
  it('maps 16:00 to Lanche', () => {
    expect(getMealGroup(new Date(2026, 5, 9, 16, 0).toISOString())).toBe('Lanche');
  });
  it('maps 20:00 to Jantar', () => {
    expect(getMealGroup(new Date(2026, 5, 9, 20, 0).toISOString())).toBe('Jantar');
  });
});
