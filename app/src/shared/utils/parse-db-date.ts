/**
 * O Postgres serializa timestamptz como "2026-07-24 15:32:10.123+00" — sem o
 * 'T' e com offset de 2 dígitos. O V8 (web/jest) aceita esse formato, mas o
 * Hermes/JSC (iOS/Android) retornam Invalid Date: o feed mostrava "há NaNd",
 * o diário perdia o horário e o agrupamento por refeição caía sempre em Jantar.
 *
 * Mesma normalização que o backend já faz em shared/local-date.ts.
 */
export function parseDbDate(value: string): Date {
  const withT = value.includes('T') ? value : value.replace(' ', 'T');
  const timeStart = withT.indexOf('T');
  // Sem parte de hora (date-only) não há offset para normalizar — e mexer aqui
  // corromperia a própria data ("2026-07-24" tem "-24" no fim).
  if (timeStart === -1) return new Date(withT);
  const datePart = withT.slice(0, timeStart);
  // Offset de 2 dígitos ("+00") vira "+00:00"; "+0000" e "Z" já são válidos.
  const timePart = withT.slice(timeStart).replace(/([+-]\d{2})$/, '$1:00');
  return new Date(`${datePart}${timePart}`);
}
