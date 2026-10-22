/** Prefixo usado tanto na escrita quanto na identificação do marcador interno. */
export const DIET_STARTED_MARKER_PREFIX = '[Dieta de 7 dias iniciada em '

export function isInternalChatMarker(content: string): boolean {
  return content.trim().startsWith(DIET_STARTED_MARKER_PREFIX)
}
