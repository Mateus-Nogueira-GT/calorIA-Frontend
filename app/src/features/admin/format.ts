/** Comparação com o período anterior: "+12%", "−5%", "igual" ou "—" (sem base). */
export function formatDelta(value: number, previous: number): string {
  if (previous === 0) return value === 0 ? 'igual' : '—';
  const pct = Math.round(((value - previous) / previous) * 100);
  if (pct === 0) return 'igual';
  return pct > 0 ? `+${pct}%` : `−${Math.abs(pct)}%`;
}

/** Frase para leitor de tela: "mais 12 por cento", "menos 5 por cento"... */
export function spokenDelta(value: number, previous: number): string {
  const delta = formatDelta(value, previous);
  if (delta === '—') return 'sem dados do período anterior';
  if (delta === 'igual') return 'igual ao período anterior';
  const n = delta.replace(/[+−%]/g, '');
  return `${delta.startsWith('+') ? 'mais' : 'menos'} ${n} por cento em relação ao período anterior`;
}

export const formatInt = (n: number): string => n.toLocaleString('pt-BR');
export const formatUsd = (n: number): string =>
  `US$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const formatDate = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';
