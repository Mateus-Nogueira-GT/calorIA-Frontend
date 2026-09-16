# CalorIA

App de nutrição que estima o que você comeu a partir de uma foto do prato, com coach de
IA, desafios e feed social.

Monorepo: `app/` é o aplicativo React Native, `backend/` é a API.

## O aplicativo

React Native com Expo, login por Apple e Google.

- **Captura** — foto do prato, tela de análise e retorno das calorias estimadas
- **Acompanhamento** — anel de calorias do dia, registro de refeições e peso
- **Coach** — chat com o assistente de nutrição
- **Social** — feed, amigos, desafios e leaderboard

## A API

Node com Fastify e TypeScript, sobre Supabase (PostgreSQL), usando OpenAI GPT-4o para a
análise da foto e o coach.

Módulos: `auth` · `users` · `scanner` · `food-log` · `diets` · `chat` · `challenges` ·
`feed` · `friends` · `weight` · `notifications` · `admin`

Validação com Zod ponta a ponta (`fastify-type-provider-zod`), JWT, rate limit e
documentação OpenAPI via Swagger.

### Avaliação do coach

O coach decide quando chamar ferramenta e quando apenas responder. Essa decisão tem
suíte de eval própria (`src/evals/coach-tool-decision.eval.test.ts`), rodada contra
conversas-fixture — um prompt alterado que passe a chamar ferramenta na hora errada
quebra o teste.

## Rodando

Cada parte tem o seu `.env.example`; o `backend/README.md` traz o passo a passo da API.

```bash
cd backend && npm install && npm run dev
cd app && npm install && npx expo start
```

## Stack

**App** — React Native, Expo, TypeScript, Zustand, React Navigation
**API** — Node, Fastify, TypeScript, Zod, Supabase (PostgreSQL), OpenAI GPT-4o
