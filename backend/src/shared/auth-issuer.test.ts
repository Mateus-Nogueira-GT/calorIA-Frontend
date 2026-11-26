import { describe, expect, it } from 'vitest'
import { isAllowedIssuer } from './auth-issuer.js'

const SUPABASE_URL = 'https://abcd.supabase.co'

describe('isAllowedIssuer', () => {
  it('aceita iss do próprio projeto Supabase', () => {
    expect(isAllowedIssuer('https://abcd.supabase.co/auth/v1', SUPABASE_URL)).toBe(true)
  })

  it('rejeita iss igual à URL do projeto, sem /auth/v1', () => {
    expect(isAllowedIssuer('https://abcd.supabase.co', SUPABASE_URL)).toBe(false)
  })

  it('rejeita caminhos arbitrários do projeto (ex: arquivo público do Storage)', () => {
    const avatar = 'https://abcd.supabase.co/storage/v1/object/public/avatars/u1/1.png'
    expect(isAllowedIssuer(`${avatar}#`, SUPABASE_URL)).toBe(false)
    expect(isAllowedIssuer(`${avatar}?x=`, SUPABASE_URL)).toBe(false)
    expect(isAllowedIssuer('https://abcd.supabase.co/qualquer', SUPABASE_URL)).toBe(false)
    expect(isAllowedIssuer('https://abcd.supabase.co/auth/v1/', SUPABASE_URL)).toBe(false)
    expect(isAllowedIssuer('https://abcd.supabase.co/auth/v1#', SUPABASE_URL)).toBe(false)
  })

  it('normaliza barra final da SUPABASE_URL', () => {
    expect(isAllowedIssuer('https://abcd.supabase.co/auth/v1', 'https://abcd.supabase.co/')).toBe(
      true,
    )
  })

  it('rejeita iss de domínio forjado', () => {
    expect(isAllowedIssuer('https://evil.com/auth/v1', SUPABASE_URL)).toBe(false)
  })

  it('rejeita iss com sufixo de subdomínio que burla startsWith', () => {
    expect(isAllowedIssuer('https://abcd.supabase.co.evil.com/auth/v1', SUPABASE_URL)).toBe(false)
  })

  it('rejeita iss que apenas contém a URL como substring no meio', () => {
    expect(isAllowedIssuer('https://evil.com/https://abcd.supabase.co', SUPABASE_URL)).toBe(false)
  })

  it('rejeita iss indefinido ou vazio', () => {
    expect(isAllowedIssuer(undefined, SUPABASE_URL)).toBe(false)
    expect(isAllowedIssuer('', SUPABASE_URL)).toBe(false)
  })
})
