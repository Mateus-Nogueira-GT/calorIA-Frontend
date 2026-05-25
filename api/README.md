# CalorIA API

Backend do aplicativo CalorIA — dietas personalizadas com IA, feed social e análise de fotos.

**Stack:** Node.js · Fastify · TypeScript · Supabase (PostgreSQL) · OpenAI GPT-4o

---

## Setup rápido

### 1. Pré-requisitos
- Node.js 20+
- npm 10+
- Conta no [Supabase](https://supabase.com)
- Conta na [OpenAI](https://platform.openai.com)

### 2. Instalar dependências
```bash
cd api
npm install
```

### 3. Configurar variáveis de ambiente
```bash
cp .env.example .env
# Abra .env e preencha todos os valores
```

### 4. Executar migrations no Supabase
Abra o **SQL Editor** no painel do Supabase e execute os arquivos em ordem:
```
supabase/migrations/001_profiles.sql
supabase/migrations/002_foods.sql
supabase/migrations/003_meals.sql
supabase/migrations/004_challenges.sql
```

### 5. Iniciar em desenvolvimento
```bash
npm run dev
```

A API estará disponível em `http://localhost:3000`  
Documentação interativa (Swagger): `http://localhost:3000/docs`

---

## Scripts disponíveis

| Script | Descrição |
|--------|-----------|
| `npm run dev` | Servidor com hot-reload |
| `npm run build` | Compila TypeScript para `dist/` |
| `npm start` | Inicia build de produção |
| `npm run typecheck` | Verifica tipos sem compilar |
| `npm run lint` | Analisa código com Biome |
| `npm run format` | Formata código com Biome |

---

## Estrutura do projeto

```
api/
├── src/
│   ├── index.ts              # Entry point
│   ├── server.ts             # Factory do Fastify (buildApp)
│   ├── plugins/
│   │   ├── db.ts             # postgres.js (queries diretas)
│   │   ├── supabase.ts       # Supabase client (auth + storage)
│   │   └── openai.ts         # OpenAI client
│   ├── modules/
│   │   ├── auth/             # Register, login, refresh
│   │   ├── users/            # Perfil do usuário
│   │   └── chat/             # Chat com IA + geração de dieta
│   └── shared/
│       ├── env.ts            # Validação de env vars (Zod)
│       ├── errors.ts         # AppError + erros padrão
│       └── types.ts          # Tipos compartilhados
└── supabase/
    └── migrations/           # SQL migrations (rodar no Supabase)
```

---

## Endpoints — Fase 1

### Auth
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/auth/register` | Criar conta |
| POST | `/auth/login` | Login (retorna JWT) |
| POST | `/auth/refresh` | Renovar token |

### Users
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/users/me` | Meu perfil |
| PUT | `/users/me/profile` | Atualizar perfil |

### Chat
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/chat/message` | Enviar mensagem para a IA |

### Geral
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/health` | Health check |
| GET | `/docs` | Swagger UI (dev only) |

---

## Autenticação

Todas as rotas protegidas exigem o header:
```
Authorization: Bearer <access_token>
```

O `access_token` é retornado pelo `/auth/login` ou `/auth/register`.

---

## Fases de desenvolvimento

| Fase | Dias | Funcionalidades |
|------|------|-----------------|
| ✅ **1** | 1–7 | Auth, perfil, chat base, migrations |
| 🔜 **2** | 8–16 | Geração de dieta personalizada (JSON estruturado) |
| 🔜 **3** | 17–26 | Feed social, posts, desafios |
| 🔜 **4** | 27–35 | Análise de foto (Vision), contagem calórica |
| 🔜 **5** | 36–45 | Testes, otimizações, deploy |
