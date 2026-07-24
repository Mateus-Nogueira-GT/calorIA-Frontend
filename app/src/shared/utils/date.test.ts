import {
  dateToString,
  todayString,
  todayDayNumber,
  tzOffsetMinutes,
  last7Days,
  formatChipLabel,
  getMealGroup,
  timeAgo,
} from './date';

describe('todayDayNumber', () => {
  it('mapeia 1=Segunda … 7=Domingo no fuso local', () => {
    // 20/07/2026 é segunda; construído com Date(y,m,d) = meia-noite LOCAL
    expect(todayDayNumber(new Date(2026, 6, 20))).toBe(1);
    expect(todayDayNumber(new Date(2026, 6, 24))).toBe(5);
    expect(todayDayNumber(new Date(2026, 6, 25))).toBe(6);
    expect(todayDayNumber(new Date(2026, 6, 26))).toBe(7);
  });
});

describe('tzOffsetMinutes', () => {
  it('convenção local = UTC + offset (inverso do getTimezoneOffset)', () => {
    const now = new Date();
    expect(tzOffsetMinutes(now)).toBe(-now.getTimezoneOffset());
  });
});

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

describe('timeAgo', () => {
  const now = new Date('2026-06-24T12:00:00Z');

  it('retorna "agora" para menos de 1 minuto', () => {
    expect(timeAgo('2026-06-24T11:59:30Z', now)).toBe('agora');
  });

  it('retorna minutos', () => {
    expect(timeAgo('2026-06-24T11:45:00Z', now)).toBe('há 15min');
  });

  it('retorna horas', () => {
    expect(timeAgo('2026-06-24T09:00:00Z', now)).toBe('há 3h');
  });

  it('retorna dias', () => {
    expect(timeAgo('2026-06-22T12:00:00Z', now)).toBe('há 2d');
  });
});
