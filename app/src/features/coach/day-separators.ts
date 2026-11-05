import { dateToString } from '@shared/utils/date';

/**
 * 05/11 (M2): a conversa é uma só e o app mostrava a semana passada como se
 * fosse hoje. Rótulo do separador ANTES de cada mensagem que abre um dia novo;
 * mensagens antigas (sem horário) ganham um único "Conversas anteriores".
 */
export function daySeparators(
  messages: { timestamp: Date | null }[],
  now: Date = new Date(),
): (string | null)[] {
  const today = dateToString(now);
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const yesterday = dateToString(y);

  let previous: string | undefined;
  return messages.map((m) => {
    const day = m.timestamp ? dateToString(m.timestamp) : 'undated';
    if (day === previous) return null;
    previous = day;
    if (day === 'undated') return 'Conversas anteriores';
    if (day === today) return 'Hoje';
    if (day === yesterday) return 'Ontem';
    const [, mm, dd] = day.split('-');
    return `${dd}/${mm}`;
  });
}
