/**
 * Issuer dos access tokens do Supabase Auth: `${SUPABASE_URL}/auth/v1`.
 * Tolera barra final na env var.
 */
export function supabaseIssuer(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/auth/v1`
}

/**
 * Valida que o `iss` (issuer) de um JWT é EXATAMENTE o do Supabase Auth do
 * projeto. A1 do pente fino: aceitar qualquer caminho sob a URL do projeto
 * (`startsWith(base + '/')`) deixava o token apontar a JWKS para um arquivo
 * público do Storage (`iss = <url do avatar>#`) e forjar qualquer `sub`.
 */
export function isAllowedIssuer(iss: string | undefined, supabaseUrl: string): boolean {
  if (!iss) return false
  return iss === supabaseIssuer(supabaseUrl)
}
