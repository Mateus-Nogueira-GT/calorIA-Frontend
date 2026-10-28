/** Prefixo usado tanto na escrita quanto na identificação do marcador interno. */
export const DIET_STARTED_MARKER_PREFIX = '[Dieta de 7 dias iniciada em '

/** Gravado pelo job ao terminar (jobs.service.ts): o modelo vê que a geração acabou. */
export const DIET_COMPLETED_MARKER = '[Dieta concluída — 7 dias]'

/**
 * Marcadores existem para o modelo: ficam no histórico do banco, mas não são
 * mostrados nem falados para o usuário.
 */
export function isInternalChatMarker(content: string): boolean {
  const text = content.trim()
  return text.startsWith(DIET_STARTED_MARKER_PREFIX) || text === DIET_COMPLETED_MARKER
}
