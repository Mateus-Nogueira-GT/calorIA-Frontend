import { generateKeyPairSync, randomUUID, sign as signBytes } from 'node:crypto'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * A7 do pente fino: o keyGenerator lia `request.user`, mas o rate limit roda
 * no onRequest, antes de qualquer jwtVerify. Na prática tudo era limitado por
 * IP: usuários atrás do mesmo NAT (ou da mesma operadora) dividiam o balde.
 * Mesmo padrão do jwt-issuer.security.test: JWKS servida por um HTTP local.
 */
vi.mock('../plugins/db.js', () => ({
  default: fp(async (app) => {
    app.decorate('db', vi.fn().mockResolvedValue([]))
  }),
}))
vi.mock('../plugins/openai.js', () => ({ default: fp(async () => {}) }))
vi.mock('../plugins/supabase.js', () => ({ default: fp(async () => {}) }))

function keyPair(kid: string) {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  return {
    privateKey,
    jwk: { ...publicKey.export({ format: 'jwk' }), kid, alg: 'ES256', use: 'sig' },
  }
}
const legit = keyPair('legit')
const attacker = keyPair('evil')

const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')

let server: http.Server
let base = ''
let app: FastifyInstance

function token(key: ReturnType<typeof keyPair>, sub: string): string {
  const head = b64url({ alg: 'ES256', typ: 'JWT', kid: key.jwk.kid })
  const body = b64url({
    sub,
    role: 'authenticated',
    aud: 'authenticated',
    iss: `${base}/auth/v1`,
    exp: Math.floor(Date.now() / 1000) + 600,
  })
  const signature = signBytes('sha256', Buffer.from(`${head}.${body}`), {
    key: key.privateKey,
    dsaEncoding: 'ieee-p1363',
  })
  return `${head}.${body}.${signature.toString('base64url')}`
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json')
    if ((req.url ?? '').split('?')[0] === '/auth/v1/.well-known/jwks.json') {
      return res.end(JSON.stringify({ keys: [legit.jwk] }))
    }
    res.statusCode = 404
    res.end('{}')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  process.env.SUPABASE_URL = base

  const { buildApp } = await import('../server.js')
  app = await buildApp()
  // Rota de sonda com limite baixo; não exige auth, só mede a chave do limite.
  app.get('/rl-probe', { config: { rateLimit: { max: 2, timeWindow: '1 minute' } } }, async () => ({
    ok: true,
  }))
  await app.ready()
})

afterAll(async () => {
  await app?.close()
  server?.close()
})

const probe = (ip: string, bearer?: string) =>
  app.inject({
    method: 'GET',
    url: '/rl-probe',
    remoteAddress: ip,
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  })

describe('A7: rate limit por conta depois do JWT verificado', () => {
  it('dois usuários válidos no mesmo IP têm limites independentes', async () => {
    const a = token(legit, randomUUID())
    const b = token(legit, randomUUID())
    const ip = '198.51.100.10'
    expect((await probe(ip, a)).statusCode).toBe(200)
    expect((await probe(ip, a)).statusCode).toBe(200)
    expect((await probe(ip, a)).statusCode).toBe(429)
    // Antes do fix, B herdava o balde do IP e recebia 429.
    expect((await probe(ip, b)).statusCode).toBe(200)
    expect((await probe(ip, b)).statusCode).toBe(200)
  })

  it('sub forjado em token inválido não troca a chave: fica no balde do IP', async () => {
    const ip = '198.51.100.20'
    expect((await probe(ip, token(attacker, randomUUID()))).statusCode).toBe(200)
    expect((await probe(ip, token(attacker, randomUUID()))).statusCode).toBe(200)
    const third = await probe(ip, token(attacker, randomUUID()))
    expect(third.statusCode).toBe(429)
    expect(third.json().error).toBe('TOO_MANY_REQUESTS')
  })

  it('sub forjado não consome o balde da vítima', async () => {
    const victim = randomUUID()
    expect((await probe('198.51.100.30', token(attacker, victim))).statusCode).toBe(200)
    expect((await probe('198.51.100.30', token(attacker, victim))).statusCode).toBe(200)
    // A vítima, com token legítimo em outro IP, segue com o limite inteiro.
    expect((await probe('198.51.100.31', token(legit, victim))).statusCode).toBe(200)
    expect((await probe('198.51.100.31', token(legit, victim))).statusCode).toBe(200)
  })

  it('sem bearer continua por IP', async () => {
    const ip = '198.51.100.40'
    await probe(ip)
    await probe(ip)
    expect((await probe(ip)).statusCode).toBe(429)
  })

  it('/auth/login segue por IP mesmo com bearers válidos de usuários diferentes', async () => {
    const ip = '198.51.100.50'
    const codes: number[] = []
    for (let i = 0; i < 11; i++) {
      const r = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {},
        remoteAddress: ip,
        headers: { authorization: `Bearer ${token(legit, randomUUID())}` },
      })
      codes.push(r.statusCode)
    }
    expect(codes.slice(0, 10).every((c) => c !== 429)).toBe(true)
    expect(codes[10]).toBe(429)
  })
})
