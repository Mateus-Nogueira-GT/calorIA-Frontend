# Painel Admin (Workstream M) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao dono do produto um painel somente-leitura com métricas de negócio e custo de IA, protegido por um flag `is_admin` verificado no banco a cada request.

**Architecture:** Migration adiciona `profiles.is_admin` e a tabela `ai_usage`. Um hook `requireAdmin` (fail-closed, responde 404) protege o módulo novo `admin`, que expõe `GET /admin/metrics` agregando 4 blocos em queries paralelas. O helper `logAiUsage` passa a persistir além de logar. No app, uma tela nova aparece no Perfil apenas quando `user.isAdmin`.

**Tech Stack:** Fastify + Zod + postgres.js (backend, vitest) · React Native 0.76 + zustand (app, jest) · Supabase/Postgres.

## Global Constraints

- Branch: `feat/admin-panel`, criada a partir da `main` atualizada (todos os workstreams A–L já estão mergeados).
- Backend: comandos rodam em `backend/`; testes com `npx vitest run`; lint `npx biome check --write <arquivos>`.
- App: comandos rodam em `app/`; **use `node_modules/.bin/jest`**, não `npx jest` (o npx resolve um jest do cache global que quebra na sintaxe TS).
- Baselines a preservar: backend **76 testes passando, 0 falhas**; app **6 suítes / 11 testes falhando** (pré-existentes, não relacionadas) e **7 erros de `tsc` em `src`**.
- Padrão de erro do backend: `AppError(status, 'CODE', 'mensagem em pt-BR')`.
- Migration nova: `backend/supabase/migrations/015_admin.sql` (a 014 é a última existente).
- Toda migration precisa ser idempotente (`IF NOT EXISTS` / `OR REPLACE`).
- **Nunca** confiar em claim de JWT ou estado do cliente para autorização: a fonte da verdade é `profiles.is_admin`.

---

### Task 1: Migration — `is_admin` e tabela `ai_usage`

**Files:**
- Create: `backend/supabase/migrations/015_admin.sql`

**Interfaces:**
- Produces: coluna `profiles.is_admin BOOLEAN NOT NULL DEFAULT false`; tabela `public.ai_usage` com colunas `id, user_id, feature, model, prompt_tokens, completion_tokens, total_tokens, created_at`.

- [ ] **Step 1: Escrever a migration**

```sql
-- backend/supabase/migrations/015_admin.sql
-- ============================================================
-- Migration 015 — Painel Admin (Workstream M)
-- M1.1: flag de admin no perfil
-- M1.2: persistência do uso de IA (antes só existia em log)
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

-- ─── M1.1: flag de admin ─────────────────────────────────────────────────────
-- A concessão é MANUAL (UPDATE abaixo, comentado). Não existe rota que promova
-- alguém a admin — é o que impede escalada de privilégio pelo app.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- ─── M1.2: uso de IA ─────────────────────────────────────────────────────────
-- O logAiUsage do Workstream I só emitia log estruturado (decisão DI6), que não
-- é consultável por SQL. Sem esta tabela o painel não consegue mostrar custo.
CREATE TABLE IF NOT EXISTS public.ai_usage (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SET NULL (não CASCADE): apagar o usuário não apaga o histórico de custo.
  user_id           UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  feature           TEXT        NOT NULL CHECK (feature IN ('chat', 'diet_day', 'vision')),
  model             TEXT        NOT NULL,
  prompt_tokens     INTEGER,
  completion_tokens INTEGER,
  total_tokens      INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_usage_created_idx      ON public.ai_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_user_created_idx ON public.ai_usage (user_id, created_at DESC);

-- RLS habilitada SEM policy: nenhum usuário lê esta tabela via PostgREST.
-- Só o backend (service_role, que bypassa RLS) tem acesso.
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

-- ─── Conceder admin (rodar manualmente, trocando o email) ────────────────────
-- UPDATE public.profiles SET is_admin = true
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'activeconexautomacoes@gmail.com');
```

- [ ] **Step 2: Validar a sintaxe SQL**

Run: `cd backend && grep -c "IF NOT EXISTS" supabase/migrations/015_admin.sql`
Expected: `4` — um por objeto criado: ADD COLUMN, CREATE TABLE e os 2 índices.

- [ ] **Step 3: Commit**

```bash
git add backend/supabase/migrations/015_admin.sql
git commit -m "feat(admin): migration 015 — profiles.is_admin e tabela ai_usage"
```

---

### Task 2: Hook `requireAdmin`

**Files:**
- Create: `backend/src/shared/require-admin.ts`
- Test: `backend/src/shared/require-admin.test.ts`

**Interfaces:**
- Consumes: `profiles.is_admin` (Task 1).
- Produces: `isAdminUser(fastify: FastifyInstance, userId: string): Promise<boolean>` — função pura de decisão, testável sem HTTP. E `registerAdminGuard(fastify: FastifyInstance): void` — registra o `preHandler` que responde 404 para não-admin.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// backend/src/shared/require-admin.test.ts
import type { FastifyInstance } from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import { isAdminUser } from './require-admin.js'

/** Fastify falso cujo `db` (template tag) devolve as linhas informadas. */
function fakeFastify(rows: unknown[] | Error): FastifyInstance {
  const db = () => (rows instanceof Error ? Promise.reject(rows) : Promise.resolve(rows))
  return { db, log: { warn: vi.fn() } } as unknown as FastifyInstance
}

describe('isAdminUser', () => {
  it('true quando o perfil tem is_admin', async () => {
    await expect(isAdminUser(fakeFastify([{ is_admin: true }]), 'u1')).resolves.toBe(true)
  })

  it('false quando o perfil não é admin', async () => {
    await expect(isAdminUser(fakeFastify([{ is_admin: false }]), 'u1')).resolves.toBe(false)
  })

  it('false quando o usuário não existe', async () => {
    await expect(isAdminUser(fakeFastify([]), 'fantasma')).resolves.toBe(false)
  })

  it('fail-closed: erro de banco vira false (nunca libera por falha)', async () => {
    await expect(isAdminUser(fakeFastify(new Error('db down')), 'u1')).resolves.toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run src/shared/require-admin.test.ts`
Expected: FAIL — `Cannot find module './require-admin.js'`

- [ ] **Step 3: Implementar**

```ts
// backend/src/shared/require-admin.ts
import type { FastifyInstance } from 'fastify'
import type { JwtPayload } from './types.js'

/**
 * Autorização de admin (Workstream M).
 *
 * A fonte da verdade é SEMPRE a coluna profiles.is_admin, consultada a cada
 * request — nunca um claim do JWT nem estado do cliente. Assim, revogar o
 * privilégio tem efeito imediato e forjar o token não concede acesso.
 *
 * Fail-closed: qualquer erro na consulta nega o acesso.
 */
export async function isAdminUser(fastify: FastifyInstance, userId: string): Promise<boolean> {
  try {
    const [row] = await fastify.db<{ is_admin: boolean }[]>`
      SELECT is_admin FROM profiles WHERE id = ${userId}
    `
    return row?.is_admin === true
  } catch (err) {
    fastify.log.warn(err, 'Falha ao verificar is_admin — negando acesso')
    return false
  }
}

/**
 * Registra o preHandler de admin no escopo do plugin. Deve vir DEPOIS do hook
 * de jwtVerify (ordem de registro importa no Fastify).
 *
 * Responde 404 em vez de 403 de propósito: não revelamos que a rota existe
 * para quem não pode usá-la.
 */
export function registerAdminGuard(fastify: FastifyInstance): void {
  fastify.addHook('preHandler', async (request, reply) => {
    const { sub: userId } = request.user as JwtPayload
    if (!(await isAdminUser(fastify, userId))) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Recurso não encontrado' })
    }
  })
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run src/shared/require-admin.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add backend/src/shared/require-admin.ts backend/src/shared/require-admin.test.ts
git commit -m "feat(admin): guarda requireAdmin — verifica is_admin no banco, fail-closed, responde 404"
```

---

### Task 3: Persistir o uso de IA

**Files:**
- Modify: `backend/src/shared/ai-usage.ts`
- Test: `backend/src/shared/ai-usage.test.ts` (arquivo já existe; adicionar casos)

**Interfaces:**
- Consumes: tabela `ai_usage` (Task 1).
- Produces: `logAiUsage(fastify, params)` mantém a MESMA assinatura (os 3 call-sites em `chat.service.ts:227`, `jobs.service.ts:397` e `scanner.service.ts:54` não mudam), mas agora também grava no banco.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `backend/src/shared/ai-usage.test.ts`:

```ts
describe('logAiUsage — persistência (M3)', () => {
  it('grava a linha em ai_usage', async () => {
    const db = vi.fn().mockResolvedValue([])
    const fastify = { log: { info: vi.fn(), warn: vi.fn() }, db } as unknown as FastifyInstance

    logAiUsage(fastify, {
      feature: 'diet_day',
      model: 'openai/gpt-5',
      userId: 'u1',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    })

    // A gravação é disparada sem await (não bloqueia a request);
    // esperamos um tick para a promise resolver.
    await new Promise((r) => setImmediate(r))
    expect(db).toHaveBeenCalled()
  })

  it('erro de banco NÃO propaga (best-effort) e não derruba a request', async () => {
    const db = vi.fn().mockRejectedValue(new Error('tabela ausente'))
    const warn = vi.fn()
    const fastify = { log: { info: vi.fn(), warn }, db } as unknown as FastifyInstance

    expect(() =>
      logAiUsage(fastify, { feature: 'chat', model: 'm', userId: 'u1' }),
    ).not.toThrow()

    await new Promise((r) => setImmediate(r))
    expect(warn).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/shared/ai-usage.test.ts`
Expected: FAIL — `db` nunca é chamado (a função hoje só loga).

- [ ] **Step 3: Implementar**

Em `backend/src/shared/ai-usage.ts`, substituir o corpo de `logAiUsage` por:

```ts
/**
 * Registra o uso de tokens de uma completion: log estruturado + linha em
 * ai_usage (o log sozinho não é consultável por SQL, então o painel admin
 * não conseguia mostrar custo).
 *
 * NUNCA lança e NUNCA bloqueia: a gravação é disparada sem await e qualquer
 * falha vira warn. Uma indisponibilidade da tabela não pode derrubar a
 * geração de uma dieta nem uma mensagem do coach.
 */
export function logAiUsage(fastify: FastifyInstance, params: AiUsageParams): void {
  try {
    fastify.log.info(
      {
        ai_usage: {
          feature: params.feature,
          model: params.model,
          userId: params.userId,
          promptTokens: params.usage?.prompt_tokens ?? null,
          completionTokens: params.usage?.completion_tokens ?? null,
          totalTokens: params.usage?.total_tokens ?? null,
        },
      },
      'ai_usage',
    )

    void fastify.db`
      INSERT INTO ai_usage (user_id, feature, model, prompt_tokens, completion_tokens, total_tokens)
      VALUES (
        ${params.userId}, ${params.feature}, ${params.model},
        ${params.usage?.prompt_tokens ?? null},
        ${params.usage?.completion_tokens ?? null},
        ${params.usage?.total_tokens ?? null}
      )
    `.catch((err: unknown) => {
      fastify.log.warn(err, 'Falha ao persistir ai_usage (telemetria best-effort)')
    })
  } catch {
    // Telemetria nunca deve derrubar a request.
  }
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run src/shared/ai-usage.test.ts`
Expected: PASS (os 7 existentes + 2 novos = 9)

- [ ] **Step 5: Commit**

```bash
git add backend/src/shared/ai-usage.ts backend/src/shared/ai-usage.test.ts
git commit -m "feat(admin): logAiUsage passa a persistir em ai_usage (best-effort, sem bloquear)"
```

---

### Task 4: Service de métricas

**Files:**
- Create: `backend/src/modules/admin/admin.schemas.ts`
- Create: `backend/src/modules/admin/admin.service.ts`
- Test: `backend/src/modules/admin/admin.service.test.ts`

**Interfaces:**
- Consumes: `ai_usage` (Task 1).
- Produces:
  - `adminMetricsSchema` (Zod) e o tipo `AdminMetrics`
  - `metricsQuerySchema` — `{ days: number }` com default 30, min 1, max 365
  - `successRate(completed: number, failed: number): number`
  - `getAdminMetrics(fastify: FastifyInstance, days: number): Promise<AdminMetrics>`

- [ ] **Step 1: Escrever os schemas**

```ts
// backend/src/modules/admin/admin.schemas.ts
import { z } from 'zod'

export const metricsQuerySchema = z.object({
  /** Janela de análise. 30 dias cobre o mês corrente sem pesar a query. */
  days: z.coerce.number().int().min(1).max(365).default(30),
})

export const adminMetricsSchema = z.object({
  periodDays: z.number().int(),
  users: z.object({
    total: z.number().int(),
    new7d: z.number().int(),
    newInPeriod: z.number().int(),
    active7d: z.number().int(),
    withActiveDiet: z.number().int(),
  }),
  diets: z.object({
    generatedInPeriod: z.number().int(),
    jobsCompleted: z.number().int(),
    jobsFailed: z.number().int(),
    jobsRunning: z.number().int(),
    successRate: z.number(),
  }),
  engagement: z.object({
    mealsLogged7d: z.number().int(),
    avgStreak: z.number(),
    maxStreak: z.number().int(),
    postsInPeriod: z.number().int(),
    commentsInPeriod: z.number().int(),
    activeChallenges: z.number().int(),
  }),
  ai: z.object({
    totalCalls: z.number().int(),
    byFeature: z.array(
      z.object({
        feature: z.string(),
        calls: z.number().int(),
        totalTokens: z.number().int(),
      }),
    ),
    topUsers: z.array(
      z.object({
        userId: z.string().nullable(),
        name: z.string(),
        totalTokens: z.number().int(),
      }),
    ),
  }),
})

export const errorSchema = z.object({ error: z.string(), message: z.string() })

export type AdminMetrics = z.infer<typeof adminMetricsSchema>
export type MetricsQuery = z.infer<typeof metricsQuerySchema>
```

- [ ] **Step 2: Escrever o teste da lógica pura**

```ts
// backend/src/modules/admin/admin.service.test.ts
import { describe, expect, it } from 'vitest'
import { successRate } from './admin.service.js'

describe('successRate (M4.2)', () => {
  it('sem jobs → 0 (nunca divide por zero)', () => {
    expect(successRate(0, 0)).toBe(0)
  })

  it('só sucessos → 1', () => {
    expect(successRate(10, 0)).toBe(1)
  })

  it('só falhas → 0', () => {
    expect(successRate(0, 4)).toBe(0)
  })

  it('arredonda a 2 casas', () => {
    // 2 / 3 = 0.6666...
    expect(successRate(2, 1)).toBe(0.67)
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/modules/admin/admin.service.test.ts`
Expected: FAIL — `Cannot find module './admin.service.js'`

- [ ] **Step 4: Implementar o service**

```ts
// backend/src/modules/admin/admin.service.ts
import type { FastifyInstance } from 'fastify'
import type { AdminMetrics } from './admin.schemas.js'

/** Taxa de sucesso dos jobs. Denominador zero → 0 (sem NaN na UI). */
export function successRate(completed: number, failed: number): number {
  const total = completed + failed
  if (total === 0) return 0
  return Math.round((completed / total) * 100) / 100
}

async function getUserMetrics(
  fastify: FastifyInstance,
  days: number,
): Promise<AdminMetrics['users']> {
  const [row] = await fastify.db<
    {
      total: number
      new_7d: number
      new_period: number
      active_7d: number
      with_active_diet: number
    }[]
  >`
    SELECT
      (SELECT COUNT(*)::INT FROM profiles) AS total,
      (SELECT COUNT(*)::INT FROM profiles WHERE created_at >= NOW() - INTERVAL '7 days') AS new_7d,
      (SELECT COUNT(*)::INT FROM profiles
        WHERE created_at >= NOW() - (${days} || ' days')::interval) AS new_period,
      (SELECT COUNT(*)::INT FROM (
         -- Ativo = registrou refeição, concluiu refeição do plano ou fez check-in
         SELECT user_id FROM meals WHERE meal_date >= CURRENT_DATE - 7
         UNION
         SELECT d.user_id
           FROM diet_meals dm
           JOIN diet_days dd ON dd.id = dm.diet_day_id
           JOIN diets d      ON d.id  = dd.diet_id
          WHERE dm.completed_at >= NOW() - INTERVAL '7 days'
         UNION
         -- challenge_days guarda member_id; o user_id vem de challenge_members
         SELECT cm.user_id
           FROM challenge_days cd
           JOIN challenge_members cm ON cm.id = cd.member_id
          WHERE cd.check_date >= CURRENT_DATE - 7
       ) AS ativos) AS active_7d,
      (SELECT COUNT(DISTINCT user_id)::INT FROM diets WHERE status = 'active') AS with_active_diet
  `
  return {
    total: row.total,
    new7d: row.new_7d,
    newInPeriod: row.new_period,
    active7d: row.active_7d,
    withActiveDiet: row.with_active_diet,
  }
}

async function getDietMetrics(
  fastify: FastifyInstance,
  days: number,
): Promise<AdminMetrics['diets']> {
  const [row] = await fastify.db<
    { generated: number; completed: number; failed: number; running: number }[]
  >`
    SELECT
      (SELECT COUNT(*)::INT FROM diets
        WHERE created_at >= NOW() - (${days} || ' days')::interval) AS generated,
      (SELECT COUNT(*)::INT FROM diet_jobs
        WHERE status = 'completed'
          AND created_at >= NOW() - (${days} || ' days')::interval) AS completed,
      (SELECT COUNT(*)::INT FROM diet_jobs
        WHERE status = 'failed'
          AND created_at >= NOW() - (${days} || ' days')::interval) AS failed,
      (SELECT COUNT(*)::INT FROM diet_jobs
        WHERE status IN ('pending', 'running')) AS running
  `
  return {
    generatedInPeriod: row.generated,
    jobsCompleted: row.completed,
    jobsFailed: row.failed,
    jobsRunning: row.running,
    successRate: successRate(row.completed, row.failed),
  }
}

async function getEngagementMetrics(
  fastify: FastifyInstance,
  days: number,
): Promise<AdminMetrics['engagement']> {
  const [row] = await fastify.db<
    {
      meals_7d: number
      avg_streak: string | null
      max_streak: number | null
      posts: number
      comments: number
      challenges: number
    }[]
  >`
    SELECT
      (SELECT COUNT(*)::INT FROM meals WHERE meal_date >= CURRENT_DATE - 7) AS meals_7d,
      -- Média só entre quem tem streak: incluir zerados dilui a métrica.
      (SELECT AVG(current_streak) FROM streaks WHERE current_streak > 0) AS avg_streak,
      (SELECT MAX(current_streak) FROM streaks) AS max_streak,
      (SELECT COUNT(*)::INT FROM feed_posts
        WHERE created_at >= NOW() - (${days} || ' days')::interval) AS posts,
      (SELECT COUNT(*)::INT FROM post_comments
        WHERE created_at >= NOW() - (${days} || ' days')::interval) AS comments,
      (SELECT COUNT(*)::INT FROM challenges
        WHERE COALESCE(ends_at, starts_at + (duration_days || ' days')::interval)::DATE
              >= CURRENT_DATE) AS challenges
  `
  return {
    mealsLogged7d: row.meals_7d,
    avgStreak: row.avg_streak ? Math.round(Number(row.avg_streak) * 10) / 10 : 0,
    maxStreak: row.max_streak ?? 0,
    postsInPeriod: row.posts,
    commentsInPeriod: row.comments,
    activeChallenges: row.challenges,
  }
}

async function getAiMetrics(fastify: FastifyInstance, days: number): Promise<AdminMetrics['ai']> {
  const byFeature = await fastify.db<
    { feature: string; calls: number; total_tokens: number }[]
  >`
    SELECT feature,
           COUNT(*)::INT AS calls,
           COALESCE(SUM(total_tokens), 0)::INT AS total_tokens
      FROM ai_usage
     WHERE created_at >= NOW() - (${days} || ' days')::interval
     GROUP BY feature
     ORDER BY total_tokens DESC
  `

  const topUsers = await fastify.db<
    { user_id: string | null; name: string | null; total_tokens: number }[]
  >`
    SELECT a.user_id,
           COALESCE(p.full_name, p.username) AS name,
           COALESCE(SUM(a.total_tokens), 0)::INT AS total_tokens
      FROM ai_usage a
      LEFT JOIN profiles p ON p.id = a.user_id
     WHERE a.created_at >= NOW() - (${days} || ' days')::interval
     GROUP BY a.user_id, p.full_name, p.username
     ORDER BY total_tokens DESC
     LIMIT 5
  `

  return {
    totalCalls: byFeature.reduce((sum, f) => sum + f.calls, 0),
    byFeature: byFeature.map((f) => ({
      feature: f.feature,
      calls: f.calls,
      totalTokens: f.total_tokens,
    })),
    topUsers: topUsers.map((u) => ({
      userId: u.user_id,
      name: u.name ?? 'Usuário',
      totalTokens: u.total_tokens,
    })),
  }
}

/** Os 4 blocos são independentes — rodam em paralelo. */
export async function getAdminMetrics(
  fastify: FastifyInstance,
  days: number,
): Promise<AdminMetrics> {
  const [users, diets, engagement, ai] = await Promise.all([
    getUserMetrics(fastify, days),
    getDietMetrics(fastify, days),
    getEngagementMetrics(fastify, days),
    getAiMetrics(fastify, days),
  ])
  return { periodDays: days, users, diets, engagement, ai }
}
```

- [ ] **Step 5: Rodar os testes**

Run: `npx vitest run src/modules/admin/admin.service.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem saída (0 erros)

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/admin/
git commit -m "feat(admin): service de métricas (usuários, dietas, engajamento, custo de IA)"
```

---

### Task 5: Rota `GET /admin/metrics`

**Files:**
- Create: `backend/src/modules/admin/admin.routes.ts`
- Modify: `backend/src/server.ts`

**Interfaces:**
- Consumes: `registerAdminGuard` (Task 2), `getAdminMetrics` / `metricsQuerySchema` / `adminMetricsSchema` (Task 4).
- Produces: rota `GET /admin/metrics?days=N`.

- [ ] **Step 1: Escrever a rota**

```ts
// backend/src/modules/admin/admin.routes.ts
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { registerAdminGuard } from '../../shared/require-admin.js'
import type { JwtPayload } from '../../shared/types.js'
import { adminMetricsSchema, errorSchema, metricsQuerySchema } from './admin.schemas.js'
import { getAdminMetrics } from './admin.service.js'

const adminRoutes: FastifyPluginAsyncZod = async (fastify) => {
  // Ordem importa: autentica primeiro, depois verifica o privilégio.
  fastify.addHook('preHandler', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch {
      return reply
        .status(401)
        .send({ error: 'UNAUTHORIZED', message: 'Token inválido ou ausente.' })
    }
  })
  registerAdminGuard(fastify)

  /** GET /admin/metrics — painel somente leitura. */
  fastify.get(
    '/metrics',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Métricas do painel administrativo',
        description:
          'Agrega usuários, dietas, engajamento e custo de IA. Exige profiles.is_admin; ' +
          'usuário comum recebe 404 (a rota não se revela).',
        security: [{ bearerAuth: [] }],
        querystring: metricsQuerySchema,
        response: { 200: adminMetricsSchema, 400: errorSchema, 401: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      // userId não entra nas métricas (são globais), mas o guard já validou.
      const { sub: _userId } = request.user as JwtPayload
      return reply.send(await getAdminMetrics(fastify, request.query.days))
    },
  )
}

export default adminRoutes
```

- [ ] **Step 2: Registrar no servidor**

Em `backend/src/server.ts`, adicionar o import junto aos outros de rotas:

```ts
import adminRoutes from './modules/admin/admin.routes.js'
```

E registrar após `weightRoutes` (última linha do bloco de rotas):

```ts
  await app.register(adminRoutes, { prefix: '/admin' })
```

Adicionar também a tag na lista do swagger (bloco `tags:` do `app.register(swagger, ...)`):

```ts
          { name: 'Admin', description: 'Painel administrativo (somente leitura)' },
```

- [ ] **Step 3: Typecheck e build**

Run: `npx tsc --noEmit && npm run build`
Expected: ambos sem erro

- [ ] **Step 4: Suíte completa do backend**

Run: `npx vitest run 2>&1 | grep -E "Test Files|Tests"`
Expected: todos passando (76 anteriores + 10 novos = 86)

- [ ] **Step 5: Lint**

Run: `npx biome check --write src/modules/admin src/shared/require-admin.ts src/shared/ai-usage.ts src/server.ts`
Expected: "Fixed N files" ou nenhum erro

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/admin/admin.routes.ts backend/src/server.ts
git commit -m "feat(admin): rota GET /admin/metrics protegida por requireAdmin"
```

---

### Task 6: Expor `is_admin` no perfil

**Files:**
- Modify: `backend/src/modules/users/users.service.ts:10-32` (projeção do SELECT)
- Modify: `backend/src/modules/users/users.schemas.ts` (profileSchema)
- Modify: `app/src/shared/services/profile.service.ts`
- Modify: `app/src/features/auth/store.ts`
- Modify: `app/src/features/profile/hooks/useProfile.ts`

**Interfaces:**
- Consumes: `profiles.is_admin` (Task 1).
- Produces: campo `is_admin: boolean` em `GET /users/me`; `User.isAdmin?: boolean` no auth store do app.

- [ ] **Step 1: Backend — adicionar à projeção**

Em `backend/src/modules/users/users.service.ts`, dentro do SELECT de `getUserProfile`, adicionar após `p.allergies,`:

```sql
      p.is_admin,
```

- [ ] **Step 2: Backend — adicionar ao schema**

Em `backend/src/modules/users/users.schemas.ts`, no `profileSchema`, adicionar após o campo `current_streak`:

```ts
  /** Painel admin: o app só mostra a entrada do menu quando true. */
  is_admin: z.boolean(),
```

- [ ] **Step 3: Verificar backend**

Run: `cd backend && npx tsc --noEmit && npx vitest run 2>&1 | grep "Tests"`
Expected: 0 erros de tipo, testes passando

- [ ] **Step 4: App — tipo do perfil**

Em `app/src/shared/services/profile.service.ts`, em `BackendProfile`, adicionar:

```ts
  /** true quando o usuário tem privilégio de admin (painel de métricas). */
  is_admin: boolean;
```

- [ ] **Step 5: App — auth store**

Em `app/src/features/auth/store.ts`, na interface `User`, adicionar:

```ts
  isAdmin?: boolean;
```

E em `updateUser`, a assinatura muda para incluir o campo:

```ts
  updateUser: (patch: Partial<Pick<User, 'name' | 'avatarUrl' | 'avatarEmoji' | 'isAdmin'>>) => void;
```

- [ ] **Step 6: App — hidratar no useProfile**

Em `app/src/features/profile/hooks/useProfile.ts`, dentro do `.then((p) => { ... })` que chama `updateUser`, adicionar a propriedade:

```ts
          isAdmin: p.is_admin,
```

- [ ] **Step 7: Verificar app**

Run: `cd app && node_modules/.bin/jest src/features/auth src/features/profile 2>&1 | grep -E "Tests:"`
Expected: mesma contagem de falhas da baseline (3 suítes de auth pré-existentes)

Run: `node_modules/.bin/tsc --noEmit 2>&1 | grep -v "\.test\.\|__mocks__\|mocks/server" | grep -c "^src"`
Expected: `7` (baseline inalterada)

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/users app/src/shared/services/profile.service.ts app/src/features/auth/store.ts app/src/features/profile/hooks/useProfile.ts
git commit -m "feat(admin): expõe is_admin em /users/me e hidrata no app"
```

---

### Task 7: Service e tela do painel no app

**Files:**
- Create: `app/src/shared/services/admin.service.ts`
- Create: `app/src/features/admin/screens/AdminScreen.tsx`
- Test: `app/src/features/admin/screens/AdminScreen.test.tsx`

**Interfaces:**
- Consumes: `GET /admin/metrics` (Task 5).
- Produces: `adminService.getMetrics(days: number): Promise<AdminMetrics>` e o componente `AdminScreen`.

- [ ] **Step 1: Criar o service**

```ts
// app/src/shared/services/admin.service.ts
import api from './api';

export interface AdminMetrics {
  periodDays: number;
  users: {
    total: number;
    new7d: number;
    newInPeriod: number;
    active7d: number;
    withActiveDiet: number;
  };
  diets: {
    generatedInPeriod: number;
    jobsCompleted: number;
    jobsFailed: number;
    jobsRunning: number;
    successRate: number;
  };
  engagement: {
    mealsLogged7d: number;
    avgStreak: number;
    maxStreak: number;
    postsInPeriod: number;
    commentsInPeriod: number;
    activeChallenges: number;
  };
  ai: {
    totalCalls: number;
    byFeature: { feature: string; calls: number; totalTokens: number }[];
    topUsers: { userId: string | null; name: string; totalTokens: number }[];
  };
}

export const adminService = {
  /** Métricas do painel. Usuário sem privilégio recebe 404. */
  getMetrics: (days: number) =>
    api.get<AdminMetrics>('/admin/metrics', { params: { days } }).then((r) => r.data),
};
```

- [ ] **Step 2: Escrever o teste da tela**

```tsx
// app/src/features/admin/screens/AdminScreen.test.tsx
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { AdminScreen } from './AdminScreen';

jest.mock('@shared/services/admin.service', () => ({
  adminService: {
    getMetrics: jest.fn().mockResolvedValue({
      periodDays: 30,
      users: { total: 42, new7d: 5, newInPeriod: 12, active7d: 20, withActiveDiet: 30 },
      diets: {
        generatedInPeriod: 15,
        jobsCompleted: 14,
        jobsFailed: 1,
        jobsRunning: 0,
        successRate: 0.93,
      },
      engagement: {
        mealsLogged7d: 88,
        avgStreak: 4.2,
        maxStreak: 21,
        postsInPeriod: 7,
        commentsInPeriod: 3,
        activeChallenges: 2,
      },
      ai: {
        totalCalls: 120,
        byFeature: [{ feature: 'diet_day', calls: 105, totalTokens: 900000 }],
        topUsers: [{ userId: 'u1', name: 'Maria', totalTokens: 500000 }],
      },
    }),
  },
}));

describe('AdminScreen', () => {
  it('renderiza as métricas carregadas', async () => {
    const { getByText } = render(<AdminScreen />);
    await waitFor(() => expect(getByText('42')).toBeTruthy()); // total de usuários
    expect(getByText('20')).toBeTruthy(); // ativos 7d
    expect(getByText('93%')).toBeTruthy(); // taxa de sucesso formatada
  });

  it('mostra estado de erro quando a API falha', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { adminService } = require('@shared/services/admin.service');
    adminService.getMetrics.mockRejectedValueOnce(new Error('falhou'));

    const { getByText } = render(<AdminScreen />);
    await waitFor(() => expect(getByText('Não foi possível carregar')).toBeTruthy());
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd app && node_modules/.bin/jest src/features/admin`
Expected: FAIL — `Cannot find module './AdminScreen'`

- [ ] **Step 4: Implementar a tela**

```tsx
// app/src/features/admin/screens/AdminScreen.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ErrorState, Text } from '@shared/components';
import { colors, radius, spacing, typography } from '@theme';
import { adminService, AdminMetrics } from '@shared/services/admin.service';

const PERIODS = [7, 30, 90];

function Stat({ label, value }: { label: string; value: string | number }): React.JSX.Element {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.statGrid}>{children}</View>
    </View>
  );
}

/** Formata contagens grandes de tokens: 900000 → "900k". */
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

export function AdminScreen(): React.JSX.Element {
  const [days, setDays] = useState(30);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      setMetrics(await adminService.getMetrics(days));
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  if (hasError) {
    return (
      <View style={styles.container}>
        <ErrorState
          title="Não foi possível carregar"
          subtitle="Verifique sua conexão e tente novamente."
          onRetry={() => void load()}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => void load()} />}
    >
      <View style={styles.periodRow}>
        {PERIODS.map((p) => (
          <TouchableOpacity
            key={p}
            accessibilityRole="button"
            accessibilityState={{ selected: days === p }}
            onPress={() => setDays(p)}
            style={[styles.periodChip, days === p && styles.periodChipActive]}
            testID={`period-${p}`}
          >
            <Text style={[styles.periodText, days === p && styles.periodTextActive]}>{p}d</Text>
          </TouchableOpacity>
        ))}
      </View>

      {metrics ? (
        <>
          <Section title="Usuários">
            <Stat label="Total" value={metrics.users.total} />
            <Stat label="Ativos (7d)" value={metrics.users.active7d} />
            <Stat label="Novos (7d)" value={metrics.users.new7d} />
            <Stat label={`Novos (${metrics.periodDays}d)`} value={metrics.users.newInPeriod} />
            <Stat label="Com dieta ativa" value={metrics.users.withActiveDiet} />
          </Section>

          <Section title="Dietas">
            <Stat label="Geradas" value={metrics.diets.generatedInPeriod} />
            <Stat label="Sucesso" value={`${Math.round(metrics.diets.successRate * 100)}%`} />
            <Stat label="Falhas" value={metrics.diets.jobsFailed} />
            <Stat label="Em andamento" value={metrics.diets.jobsRunning} />
          </Section>

          <Section title="Engajamento">
            <Stat label="Refeições (7d)" value={metrics.engagement.mealsLogged7d} />
            <Stat label="Streak médio" value={metrics.engagement.avgStreak} />
            <Stat label="Maior streak" value={metrics.engagement.maxStreak} />
            <Stat label="Posts" value={metrics.engagement.postsInPeriod} />
            <Stat label="Comentários" value={metrics.engagement.commentsInPeriod} />
            <Stat label="Desafios ativos" value={metrics.engagement.activeChallenges} />
          </Section>

          <Section title="Custo de IA">
            <Stat label="Chamadas" value={metrics.ai.totalCalls} />
            {metrics.ai.byFeature.map((f) => (
              <Stat key={f.feature} label={f.feature} value={formatTokens(f.totalTokens)} />
            ))}
          </Section>

          {metrics.ai.topUsers.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Maiores consumidores de IA</Text>
              {metrics.ai.topUsers.map((u) => (
                <View key={u.userId ?? u.name} style={styles.topRow}>
                  <Text style={styles.topName}>{u.name}</Text>
                  <Text style={styles.topValue}>{formatTokens(u.totalTokens)} tokens</Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.brandBackground },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  periodRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  periodChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandDivider,
    backgroundColor: colors.brandSurface,
  },
  periodChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  periodText: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.regular,
    color: colors.brandAnchor,
  },
  periodTextActive: { fontFamily: typography.fontFamily.semiBold },
  section: { marginBottom: spacing.xl },
  sectionTitle: {
    fontSize: typography.fontSize.md,
    fontFamily: typography.fontFamily.bold,
    color: colors.brandAnchor,
    marginBottom: spacing.md,
  },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  stat: {
    minWidth: 100,
    flexGrow: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.brandSurface,
    borderWidth: 1,
    borderColor: colors.brandDivider,
  },
  statValue: {
    fontSize: typography.fontSize.xl,
    fontFamily: typography.fontFamily.extraBold,
    color: colors.brandAnchor,
  },
  statLabel: {
    fontSize: typography.fontSize.xs,
    fontFamily: typography.fontFamily.regular,
    color: colors.textSecondary,
    marginTop: 2,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.brandDivider,
  },
  topName: {
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.regular,
    color: colors.brandAnchor,
  },
  topValue: {
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.semiBold,
    color: colors.textSecondary,
  },
});
```

- [ ] **Step 5: Rodar os testes**

Run: `node_modules/.bin/jest src/features/admin`
Expected: PASS (2 testes)

- [ ] **Step 6: Commit**

```bash
git add app/src/shared/services/admin.service.ts app/src/features/admin/
git commit -m "feat(admin): tela do painel com métricas, seletor de período e retry"
```

---

### Task 8: Navegação condicional no Perfil

**Files:**
- Modify: `app/src/navigation/types.ts`
- Modify: `app/src/navigation/RootNavigator.tsx`
- Modify: `app/src/features/profile/screens/ProfileScreen.tsx`
- Test: `app/src/features/profile/screens/ProfileScreen.test.tsx`

**Interfaces:**
- Consumes: `AdminScreen` (Task 7), `User.isAdmin` (Task 6).
- Produces: rota `Admin` no `RootStackParamList`.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar em `app/src/features/profile/screens/ProfileScreen.test.tsx`:

```tsx
describe('ProfileScreen — entrada do painel admin (M6.3)', () => {
  it('NÃO mostra o item para usuário comum', () => {
    useAuthStore.setState({
      user: { id: '1', name: 'João', email: 'j@j.com' },
      isAuthenticated: true,
    } as never);
    const { queryByTestId } = render(<ProfileScreen {...({ navigation: { navigate: jest.fn() } } as never)} />);
    expect(queryByTestId('profile-admin-btn')).toBeNull();
  });

  it('mostra o item quando isAdmin', () => {
    useAuthStore.setState({
      user: { id: '1', name: 'João', email: 'j@j.com', isAdmin: true },
      isAuthenticated: true,
    } as never);
    const { queryByTestId } = render(<ProfileScreen {...({ navigation: { navigate: jest.fn() } } as never)} />);
    expect(queryByTestId('profile-admin-btn')).toBeTruthy();
  });
});
```

> Nota: ajuste a forma de renderizar o `ProfileScreen` ao padrão já usado no topo deste arquivo de teste (ele já monta a tela com um `navigation` mockado — reutilize esse helper em vez de duplicar).

- [ ] **Step 2: Rodar e ver falhar**

Run: `node_modules/.bin/jest src/features/profile/screens/ProfileScreen.test.tsx`
Expected: FAIL no segundo caso — `profile-admin-btn` não existe

- [ ] **Step 3: Adicionar a rota nos tipos**

Em `app/src/navigation/types.ts`, dentro de `RootStackParamList`, adicionar:

```ts
  /** Painel admin — só alcançável por quem tem is_admin no backend. */
  Admin: undefined;
```

- [ ] **Step 4: Registrar no RootNavigator**

Em `app/src/navigation/RootNavigator.tsx`, importar:

```tsx
import { AdminScreen } from '@features/admin/screens/AdminScreen';
```

E adicionar a tela junto às outras do `RootStack` (antes da `Scanner`):

```tsx
          <RootStack.Screen
            name="Admin"
            component={AdminScreen}
            options={{ headerShown: true, title: 'Painel Admin' }}
          />
```

- [ ] **Step 5: Adicionar o item no Perfil**

Em `app/src/features/profile/screens/ProfileScreen.tsx`, ler o flag do store (junto aos outros `useAuthStore`):

```tsx
  const isAdmin = useAuthStore((s) => s.user?.isAdmin === true);
```

E, dentro do `menuCard`, antes do item "Sair":

```tsx
        {isAdmin ? (
          <ProfileMenuItem
            label="📊 Painel Admin"
            description="Métricas de usuários, dietas e custo de IA"
            onPress={() => navigation.navigate('Admin')}
            testID="profile-admin-btn"
          />
        ) : null}
```

- [ ] **Step 6: Rodar os testes**

Run: `node_modules/.bin/jest src/features/profile src/features/admin`
Expected: PASS

- [ ] **Step 7: Verificação completa do app**

Run: `node_modules/.bin/jest 2>&1 | grep -E "Test Suites:|Tests:"`
Expected: 6 suítes / 11 testes falhando (baseline) — nada novo

Run: `node_modules/.bin/tsc --noEmit 2>&1 | grep -v "\.test\.\|__mocks__\|mocks/server" | grep -c "^src"`
Expected: `7` (baseline)

Run: `npm run build:web 2>&1 | tail -1`
Expected: `compiled successfully`

- [ ] **Step 8: Commit**

```bash
git add app/src/navigation app/src/features/profile
git commit -m "feat(admin): rota Admin e item no Perfil visível apenas para admin"
```

---

### Task 9: Documentação e criação da conta

**Files:**
- Create: `docs/admin-panel.md`

**Interfaces:**
- Consumes: tudo das tasks anteriores.

- [ ] **Step 1: Escrever a documentação operacional**

```markdown
# Painel Admin — operação

## Conceder privilégio de admin

Não existe rota que promova alguém a admin — é proposital: sem superfície de
promoção, não há escalada de privilégio pelo app. A concessão é manual, no
SQL Editor do Supabase:

```sql
UPDATE public.profiles SET is_admin = true
WHERE id = (SELECT id FROM auth.users WHERE email = 'EMAIL_AQUI');
```

Para revogar, troque `true` por `false`. O efeito é imediato: o backend
consulta a coluna a cada request.

## Criar a conta admin inicial

1. Registrar pela API de produção:

```bash
curl -X POST https://calor-ia-frontend.vercel.app/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"name":"Admin","email":"EMAIL_AQUI","password":"SENHA_AQUI"}'
```

2. Rodar o UPDATE acima com o mesmo email.
3. Fazer login no app e conferir se "📊 Painel Admin" aparece no Perfil.

⚠️ **Troque a senha após o primeiro acesso** se ela tiver sido transmitida
por canal não seguro (chat, email). O fluxo "esqueci minha senha" funciona.

## O que o painel mostra

| Bloco | Métricas |
|---|---|
| Usuários | total · ativos 7d · novos 7d/período · com dieta ativa |
| Dietas | geradas · taxa de sucesso dos jobs · falhas · em andamento |
| Engajamento | refeições 7d · streak médio/máximo · posts · comentários · desafios |
| Custo de IA | chamadas · tokens por feature · top 5 consumidores |

**Usuário ativo** = registrou refeição, concluiu refeição do plano ou fez
check-in de desafio nos últimos 7 dias.

**Streak médio** considera só quem tem streak > 0 (incluir contas zeradas
diluiria a métrica).

## Limitações conhecidas

- **Sem histórico retroativo de custo de IA:** a tabela `ai_usage` começa a
  coletar a partir do deploy. Os logs anteriores da Vercel não são importáveis.
- **Somente leitura:** não há ações de suporte, moderação ou edição.
- **Sem gráficos temporais:** apenas números do período selecionado.

## Segurança

- O flag vive só no banco e é verificado a cada request (`isAdminUser`).
- Falha na verificação nega o acesso (fail-closed).
- Não-admin recebe **404**, não 403 — a rota não se revela.
- A tabela `ai_usage` tem RLS habilitada sem policy de leitura: só o backend
  (service_role) acessa.
```

- [ ] **Step 2: Commit**

```bash
git add docs/admin-panel.md
git commit -m "docs(admin): operação do painel — concessão, métricas e limitações"
```

- [ ] **Step 3: Aplicar a migration em produção**

Rodar `backend/supabase/migrations/015_admin.sql` no SQL Editor do Supabase.

Verificação:

```sql
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name='profiles' AND column_name='is_admin') AS tem_is_admin,
  (SELECT COUNT(*) FROM information_schema.tables
    WHERE table_name='ai_usage') AS tem_ai_usage;
```

Esperado: `tem_is_admin = 1`, `tem_ai_usage = 1`.

- [ ] **Step 4: Criar a conta e conceder o privilégio**

Seguir `docs/admin-panel.md` com o email `activeconexautomacoes@gmail.com`.

- [ ] **Step 5: Push e PR**

```bash
git push -u origin feat/admin-panel
gh pr create --base main --title "Painel Admin (Workstream M)" --body "Implementa docs/superpowers/specs/2026-08-06-painel-admin-design.md"
```

---

## Ordem de merge e deploy

⚠️ **A migration 015 precisa ser aplicada ANTES do deploy do backend.** Sem
ela, `GET /users/me` quebra (a projeção referencia `p.is_admin`, que não
existiria) — e essa rota é usada por toda a tela de Perfil.

Sequência: aplicar a migration → mergear o PR → verificar `/api/health` →
testar o login e o Perfil.

---

## Rastreabilidade (requisito da spec → task)

| Requisito | Task | Entrega |
|---|---|---|
| M1.1 · M1.2 · M1.3 | Task 1 | Migration 015: coluna `is_admin`, tabela `ai_usage`, índices e RLS |
| M2.1 · M2.2 | Task 2 | `isAdminUser` + `registerAdminGuard` (fail-closed, 404) e 4 testes |
| M3.1 · M3.2 · M3.3 | Task 3 | `logAiUsage` persiste sem bloquear; 2 testes novos |
| M4.1 · M4.2 · M4.3 | Task 4 | Schemas Zod + service com os 4 blocos em `Promise.all` |
| M4.1 (rota) · M4.4 | Task 5 | `GET /admin/metrics` registrada e protegida |
| M5.1 · M5.2 | Task 6 | `is_admin` em `/users/me`, hidratado no auth store |
| M6.1 · M6.2 | Task 7 | `adminService` + `AdminScreen` com período, refresh e erro |
| M6.3 · M6.4 | Task 8 | Rota `Admin` e item do Perfil condicionado a `isAdmin` |
| M7.1 · M7.2 · M7.3 | Task 9 | `docs/admin-panel.md`, migration em produção e conta inicial |

**Critérios de aceite da spec** — onde cada um é verificado:

1. Usuário comum recebe 404 → Task 2 (testes de `isAdminUser`) + Task 8 Step 7
2. Admin recebe 200 com os 4 blocos → Task 5 Step 4 · Task 9 Step 4 (manual)
3. Item não aparece para não-admin → Task 8 Step 1 (teste)
4. `ai_usage` grava e falha não quebra a geração → Task 3 (2 testes)
5. `days` fora do intervalo → 400 → Task 4 (`metricsQuerySchema` min/max)
6. `successRate` com zero jobs → 0 → Task 4 Step 2 (teste)
7. Baselines preservadas → Task 5 Step 4 (backend) · Task 8 Step 7 (app)
