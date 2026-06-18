/** Payload do JWT gerado pelo Supabase Auth */
export interface JwtPayload {
  sub: string // Supabase user ID (UUID)
  email: string
  role: string // 'authenticated' | 'anon'
  aud: string
  exp: number
  iat: number
  user_metadata?: Record<string, unknown>
  app_metadata?: Record<string, unknown>
}

/** Paginação cursor-based (usada no feed) */
export interface CursorPage<T> {
  data: T[]
  next_cursor: string | null
  has_more: boolean
}
