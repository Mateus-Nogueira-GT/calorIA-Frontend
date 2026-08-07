# Spec — Painel Admin (Workstream M)

**Data:** 2026-08-06
**Origem:** Pedido de conta admin — descoberto que o app **não tem nenhum conceito de papel/privilégio**.
**Status:** Design aprovado, pronto para plano de implementação.

## 1. Objetivo

Dar ao dono do produto visibilidade sobre o negócio: quantos usuários existem e estão ativos, se a geração de dietas está funcionando, qual o engajamento e **quanto a IA está custando**.

Painel **somente leitura**. Nenhuma ação de escrita sobre dados de usuários — isso elimina a maior fonte de risco e mantém o escopo pequeno.

## 2. Contexto: o que existe hoje

Não há `role`, `is_admin` nem rota privilegiada. Todo usuário autenticado tem exatamente os mesmos poderes. As menções a "admin" no código são o cliente `service_role` do Supabase (infraestrutura do backend), não papéis de usuário.

Os dados de negócio existem em tabelas (`profiles`, `diets`, `diet_jobs`, `meals`, `streaks`, `feed_posts`, `challenges`), **exceto o custo de IA**: o `logAiUsage` do Workstream I5 só emite log estruturado (decisão DI6: "sem tabela nova"), o que não é consultável por SQL.

## 3. Decisões de design

| # | Decisão | Escolha |
|---|---------|---------|
| DM1 | Escopo do painel | **Somente leitura** — métricas de negócio e custo de IA. Sem suporte, moderação ou edição de conteúdo |
| DM2 | Superfície | **Tela dentro do app** (rota do RootStack, acessada por item no Perfil), visível apenas se o usuário for admin. Reaproveita auth, tema e componentes; funciona no web e no mobile sem front novo |
| DM3 | Concessão do privilégio | **Coluna `is_admin` em `profiles`**, marcada manualmente via SQL. Ninguém vira admin pelo app — não há rota de promoção |
| DM4 | Verificação | `preHandler` consulta a coluna **no banco a cada request**, depois do `jwtVerify`. Nunca confia em claim de JWT nem em estado do cliente |
| DM5 | Resposta a não-admin | **404**, não 403 — não revela que a rota existe |
| DM6 | Custo de IA | **Nova tabela `ai_usage`** alimentada pelo helper existente. Coleta começa no deploy; sem histórico retroativo (logs da Vercel não são importáveis) |
| DM7 | Gravação do usage | **Best-effort**: try/catch, sem `await` bloqueante. Falha de gravação nunca pode derrubar uma geração de dieta ou mensagem do coach |
| DM8 | Cálculo das métricas | **Queries diretas** a cada abertura. Sem materialized view nem job de agregação — otimizar antes de ter volume seria especulativo (YAGNI) |
| DM9 | Janela padrão | 30 dias, ajustável por query param `days` (1–365) |

## 4. Arquitetura

```
App (AdminScreen)  ──GET /admin/metrics?days=30──>  requireAdmin (preHandler)
   ↑ só monta se                                         ↓ consulta profiles.is_admin
   user.is_admin                                    admin.service (queries agregadas)
                                                          ↓
                                     profiles · diets · diet_jobs · meals ·
                                     streaks · feed_posts · challenges · ai_usage
```

**Backend:** módulo novo `backend/src/modules/admin/` (routes/service/schemas), seguindo o formato dos módulos existentes.

**Autorização:** `requireAdmin` fica em `backend/src/shared/require-admin.ts` para ser reutilizável por rotas futuras.

## 5. Requisitos

### M1 — Migration: `is_admin` e `ai_usage`

- **M1.1** `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;`
- **M1.2** Tabela `public.ai_usage`:
  ```
  id UUID PK DEFAULT gen_random_uuid()
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL
  feature TEXT NOT NULL CHECK (feature IN ('chat','diet_day','vision'))
  model TEXT NOT NULL
  prompt_tokens INT, completion_tokens INT, total_tokens INT
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  ```
  Índice `(created_at DESC)` e `(user_id, created_at DESC)`.
  RLS habilitada **sem policy de leitura para usuários** — só o `service_role` do backend acessa.
- **M1.3** A migration **não** marca ninguém como admin: a concessão é um `UPDATE` manual, documentado.

### M2 — Autorização

- **M2.1** `requireAdmin(fastify)` em `backend/src/shared/require-admin.ts`: hook que roda após `jwtVerify`, consulta `SELECT is_admin FROM profiles WHERE id = $userId` e responde **404 NOT_FOUND** se falso/ausente.
- **M2.2** Testes: admin passa; não-admin recebe 404; usuário inexistente recebe 404; falha de banco recebe 404 (fail-closed — nunca liberar por erro).

### M3 — Persistência do uso de IA

- **M3.1** `logAiUsage` ([ai-usage.ts](../../../backend/src/shared/ai-usage.ts)) passa a receber a instância e gravar em `ai_usage` além de logar. Assinatura mantida para não tocar nos 3 call-sites.
- **M3.2** Gravação disparada sem bloquear a resposta (`void ...catch(() => {})`); qualquer erro só vira `log.warn`.
- **M3.3** Teste: erro de banco não propaga (a função continua não lançando).

### M4 — Endpoint de métricas

- **M4.1** `GET /admin/metrics?days=N` (default 30, mín 1, máx 365) protegido por `requireAdmin`. Retorna:

```jsonc
{
  "periodDays": 30,
  "users":       { "total": 0, "new7d": 0, "newInPeriod": 0, "active7d": 0, "withActiveDiet": 0 },
  "diets":       { "generatedInPeriod": 0, "jobsCompleted": 0, "jobsFailed": 0, "jobsRunning": 0, "successRate": 0 },
  "engagement":  { "mealsLogged7d": 0, "avgStreak": 0, "maxStreak": 0, "postsInPeriod": 0, "commentsInPeriod": 0, "activeChallenges": 0 },
  "ai":          { "totalCalls": 0, "byFeature": [{ "feature": "chat", "calls": 0, "totalTokens": 0 }],
                   "topUsers": [{ "userId": "…", "name": "…", "totalTokens": 0 }] }
}
```

- **M4.2** Definições explícitas (evitam ambiguidade na implementação):
  - **active7d**: usuário distinto com, nos últimos 7 dias, ≥1 registro em `meals` (por `meal_date`) OU ≥1 `diet_meals.completed_at` (via `diet_days`→`diets.user_id`) OU ≥1 check-in em `challenge_days` (via `challenge_members.user_id` — a tabela guarda `member_id`, não `user_id`).
  - **withActiveDiet**: `COUNT(DISTINCT user_id)` em `diets` com `status='active'`.
  - **successRate**: `jobsCompleted / (jobsCompleted + jobsFailed)` no período, arredondado a 2 casas; `0` quando o denominador é zero.
  - **avgStreak**: média de `streaks.current_streak` **entre usuários com streak > 0** (a média global seria diluída por contas inativas).
  - **topUsers**: 5 maiores por `total_tokens` somado no período.
- **M4.3** Cada bloco é uma função isolada no service (`getUserMetrics`, `getDietMetrics`, `getEngagementMetrics`, `getAiMetrics`) executadas em `Promise.all`.
- **M4.4** Testes: schema Zod da resposta valida; `days` fora do intervalo → 400; funções puras de cálculo (successRate com denominador zero) testadas.

### M5 — Exposição do flag no perfil

- **M5.1** `GET /users/me` passa a incluir `is_admin` (mesma projeção que já traz `current_streak`).
- **M5.2** App: `BackendProfile` e o `User` do auth store ganham `isAdmin`; `useProfile` hidrata o campo.

### M6 — Tela no app

- **M6.1** `app/src/features/admin/screens/AdminScreen.tsx` + `adminService` (`getMetrics(days)`).
- **M6.2** Layout: 4 seções (Usuários, Dietas, Engajamento, IA) com cards de número + rótulo, seletor de período (7/30/90 dias), pull-to-refresh, `ErrorState` em falha e skeleton no carregamento.
- **M6.3** Rota `Admin` no `RootStackParamList` + item de menu no `ProfileScreen` **renderizado apenas se `user.isAdmin`**.
- **M6.4** Testes: item do menu não aparece para não-admin; aparece para admin; tela renderiza métricas mockadas.

### M7 — Conta admin inicial

- **M7.1** Criar `activeconexautomacoes@gmail.com` via `POST /auth/register` em produção.
- **M7.2** Marcar como admin: `UPDATE public.profiles SET is_admin = true WHERE id = (SELECT id FROM auth.users WHERE email = '...');`
- **M7.3** ⚠️ A senha inicial foi transmitida em texto no chat — **deve ser trocada** pelo fluxo de recuperação de senha após o primeiro acesso.

## 6. Critérios de aceite

1. Usuário comum chamando `GET /admin/metrics` recebe **404** (não 403, não 200).
2. Conta marcada com `is_admin=true` recebe 200 com os 4 blocos preenchidos.
3. O item "Painel Admin" **não aparece** no Perfil de usuário comum.
4. Gerar uma dieta cria linhas em `ai_usage`; derrubar a tabela (simulado) **não quebra** a geração.
5. `days=0` e `days=999` retornam 400; `days` ausente usa 30.
6. `successRate` com zero jobs retorna 0 (sem divisão por zero).
7. Baselines de teste do backend (vitest) e do app (jest) preservadas.

## 7. Fora de escopo (v2 natural)

Ações de escrita (reprocessar job, editar perfil de terceiro, resetar senha), moderação de feed, edição da tabela `foods` e de prompts, gráficos temporais, exportação CSV, múltiplos níveis de permissão, tela de promoção de admin.

## 8. Riscos

| Risco | Mitigação |
|---|---|
| Escalada de privilégio | Flag só no banco, verificado a cada request, sem rota de promoção; fail-closed em erro |
| Vazamento de dados sensíveis | Painel só agrega — não expõe dieta, peso ou refeição de usuário identificável (exceto nome nos top 5 de consumo de IA) |
| `ai_usage` crescer sem limite | Volume baixo (≈8 linhas por dieta gerada). Se crescer, agregar e purgar — documentar em `mobile-hardening.md` |
| Query lenta com volume | Índices em `created_at`; se degradar, migrar para agregação diária (DM8 registra o gatilho) |
