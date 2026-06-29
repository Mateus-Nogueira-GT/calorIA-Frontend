/**
 * Valida que o `iss` (issuer) de um JWT pertence ao projeto Supabase
 * configurado, ANTES de buscar a JWKS desse domínio. Evita que um token
 * forjado aponte o backend para uma JWKS de domínio controlado pelo atacante.
 *
 * Usa fronteira exata (`=== base` ou `base + '/'`) em vez de um `startsWith`
 * solto — caso contrário um issuer como `https://abcd.supabase.co.evil.com`
 * passaria por começar com a URL do projeto.
 */
export function isAllowedIssuer(
  iss: string | undefined,
  supabaseUrl: string,
): boolean {
  if (!iss) return false
  const base = supabaseUrl.replace(/\/+$/, '')
  return iss === base || iss.startsWith(`${base}/`)
}
