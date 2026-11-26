import { generateKeyPairSync, randomUUID, sign as signBytes } from 'node:crypto'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * A1 do pente fino (JWT forjado com JWKS hospedada no Storage). Um servidor
 * HTTP local faz o papel do SUPABASE_URL: serve a JWKS legítima em
 * /auth/v1/.well-known/jwks.json e, no caminho público de um "avatar", uma JWKS
 * do atacante. O teste usa o buildApp() real, sem rede além de localhost.
 */
vi.mock('../plugins/db.js', () => ({
  default: fp(async (app) => {
    app.decorate('db', vi.fn().mockResolvedValue([]))
  }),
}))
vi.mock('../plugins/openai.js', () => ({ default: fp(async () => {}) }))
vi.mock('../plugins/supabase.js', () => ({ default: fp(async () => {}) }))

const victimUid = randomUUID()
const attackerUid = randomUUID()
const avatarPath = `/storage/v1/object/public/avatars/${attackerUid}/1700000000000.png`

function keyPair(kid: string) {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  return {
    privateKey,
    jwk: { ...publicKey.export({ format: 'jwk' }), kid, alg: 'ES256', use: 'sig' },
  }
}
const legit = keyPair('legit')
const attacker = keyPair('evil')

function b64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

/** Assina um ES256 só com node:crypto (r||s, como manda o JWS). */
function signJwt(key: ReturnType<typeof keyPair>, claims: Record<string, unknown>): string {
  const head = b64url({ alg: 'ES256', typ: 'JWT', kid: key.jwk.kid })
  const body = b64url({
    sub: victimUid,
    role: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 600,
    ...claims,
  })
  const signature = signBytes('sha256', Buffer.from(`${head}.${body}`), {
    key: key.privateKey,
    dsaEncoding: 'ieee-p1363',
  })
  return `${head}.${body}.${signature.toString('base64url')}`
}

let server: http.Server
let base = ''
let app: FastifyInstance
const hits: string[] = []

beforeAll(async () => {
  server = http.createServer((req, res) => {
    hits.push(req.url ?? '')
    // O Storage ignora query string desconhecida e o fragment nunca chega.
    const path = (req.url ?? '').split('?')[0]
    res.setHeader('content-type', 'application/json')
    if (path === '/auth/v1/.well-known/jwks.json') {
      return res.end(JSON.stringify({ keys: [legit.jwk] }))
    }
    if (path === avatarPath || path === '/qualquer/.well-known/jwks.json') {
      return res.end(JSON.stringify({ keys: [attacker.jwk] }))
    }
    res.statusCode = 404
    res.end('{}')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  process.env.SUPABASE_URL = base

  const { buildApp } = await import('../server.js')
  app = await buildApp()
  // Mesmo padrão das rotas reais: falha no jwtVerify → 401.
  app.get('/whoami', {
    preHandler: async (request, reply) => {
      try {
        await request.jwtVerify()
      } catch {
        return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'x' })
      }
    },
    handler: async (request) => ({ sub: (request.user as { sub: string }).sub }),
  })
  await app.ready()
})

afterAll(async () => {
  await app?.close()
  server?.close()
})

async function whoami(token: string) {
  return app.inject({
    method: 'GET',
    url: '/whoami',
    headers: { authorization: `Bearer ${token}` },
  })
}

describe('A1: issuer e audiência do JWT', () => {
  it('token legítimo do Supabase (iss /auth/v1, aud authenticated) → 200', async () => {
    const r = await whoami(signJwt(legit, { iss: `${base}/auth/v1`, aud: 'authenticated' }))
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ sub: victimUid })
  })

  it.each([
    ['fragment', () => `${base}${avatarPath}#`],
    ['query', () => `${base}${avatarPath}?x=`],
    ['caminho arbitrário', () => `${base}/qualquer`],
  ])('iss apontando para JWKS do atacante (%s) → 401', async (_name, iss) => {
    const r = await whoami(signJwt(attacker, { iss: iss(), aud: 'authenticated' }))
    expect(r.statusCode).toBe(401)
  })

  it('iss certo, mas chave do atacante → 401', async () => {
    const r = await whoami(signJwt(attacker, { iss: `${base}/auth/v1`, aud: 'authenticated' }))
    expect(r.statusCode).toBe(401)
  })

  it('aud diferente de authenticated → 401', async () => {
    const r = await whoami(signJwt(legit, { iss: `${base}/auth/v1`, aud: 'anon' }))
    expect(r.statusCode).toBe(401)
  })

  it('sem aud → 401', async () => {
    const r = await whoami(signJwt(legit, { iss: `${base}/auth/v1` }))
    expect(r.statusCode).toBe(401)
  })

  // Rotas com jwtVerify() sem try/catch (admin, créditos, recarga): o erro do
  // issuer precisa chegar como 401, e não como 500/503.
  it.each([
    ['/admin/overview', 'iss do avatar', () => `${base}${avatarPath}#`],
    ['/credits/me', 'iss do avatar', () => `${base}${avatarPath}#`],
    ['/credit-invites/redeem', 'iss do avatar', () => `${base}${avatarPath}#`],
    ['/admin/overview', 'kid fora da JWKS', () => `${base}/auth/v1`],
  ])('rota real %s com %s → 401', async (url, _caso, iss) => {
    const token = signJwt(attacker, { iss: iss(), aud: 'authenticated' })
    const r = await app.inject({
      method: url.endsWith('/redeem') ? 'POST' : 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
      ...(url.endsWith('/redeem') ? { payload: { token: 'x'.repeat(43) } } : {}),
    })
    expect(r.statusCode).toBe(401)
  })

  it('a JWKS do avatar nunca é buscada', () => {
    expect(hits.some((h) => h.startsWith('/storage/') || h.startsWith('/qualquer'))).toBe(false)
  })
})
