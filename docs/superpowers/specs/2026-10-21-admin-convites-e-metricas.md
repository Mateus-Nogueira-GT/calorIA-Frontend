# Admin: convites e métricas de usuários

Data: 21/10/2026. Base: main `9ee96fd`.
Status: **proposta para revisão**. Nada implementado.
Substitui a parte de métricas da [spec do painel admin de 06/08](2026-08-06-painel-admin-design.md), que nunca chegou a ter rota.

## 1. Objetivo

Dar ao dono do produto uma área de administração em que ele:

1. gera e compartilha **links de convite** (15 créditos) e acompanha o que aconteceu com cada um;
2. vê a **saúde do negócio**: usuários, uso, créditos, convites e custo de IA;
3. consulta a **lista de usuários com métricas individuais**.

## 2. O que já existe

| Peça | Estado na `main` |
|---|---|
| Privilégio | `profiles.is_admin`, concedido só por SQL (migration 015). `registerAdminGuard` consulta o banco a cada request e responde **404** a quem não é admin (fail-closed). |
| Entrada no app | Perfil → **Administração**, visível só para admin (`ProfileScreen`, `isAdmin`). |
| Convites | `AdminScreen` gera link com identificação, compartilha, lista e revoga. As rotas são `GET/POST /admin/credit-invites` e `POST /admin/credit-invites/:id/revoke`. |
| Métricas gerais | `getAdminMetrics` em `admin.service.ts` (usuários, dietas, engajamento, IA) **existe mas não tem rota nem tela**. |
| Dados de uso | `ai_usage` (chat, diet_day, vision, transcribe, speech), `credit_wallets`, `credit_ledger`, `credit_operations`, `credit_invites`, `credit_welcome_claims`, `meals`, `diets`, `streaks`. |

## 3. Decisões (21/10)

| # | Decisão |
|---|---|
| D1 | **Mesma área no app e no navegador.** Evolui a tela Administração. O app web (`calor-ia-frontend.vercel.app`) é o mesmo código React Native, e no computador o layout aproveita a largura. Não há front nem login separados. |
| D2 | **Métricas:** visão geral do negócio, lista de usuários com métricas e métricas dos convites. O detalhe por usuário (extrato e uso diário) fica para a v2. |
| D3 | **Convites:** continua "gerar link e compartilhar", melhorado com o acompanhamento de cada link. Fica fora: lote de convites, crédito direto a usuário e envio por e-mail. |
| D4 | **Admin só por SQL.** Nenhuma tela concede ou retira o privilégio. |
| D5 | **Somente leitura**, fora a criação e revogação de convites que já existem. |

## 4. Experiência

A tela **Administração** passa a ter três abas no topo (segmentado). No celular ficam empilhadas; a partir de 900 px de largura, os cards ficam em grade.

### 4.1 Visão geral
Seletor de período: **7 / 30 / 90 dias** (padrão 30). Cards com número grande e rótulo curto. Cada card mostra também o valor do período anterior equivalente (ex.: "+12% vs. 30 dias antes"), quando o dado existe.

| Bloco | Métricas |
|---|---|
| Usuários | Total de contas; novas no período; ativas nos últimos 7 dias; ativas no período; com dieta ativa |
| Uso | Fotos analisadas; mensagens ao Coach (texto e voz separados); refeições registradas; dietas geradas (concluídas e com falha) |
| Créditos | Créditos concedidos no período (boas-vindas automáticas e convites, separados); créditos consumidos (fotos e mensagens); saldo total em carteiras; contas com saldo zero |
| Convites | Gerados; resgatados; taxa de resgate; expirados sem uso; revogados |
| IA | Chamadas e tokens por recurso (chat, visão, dieta, transcrição, voz); **custo estimado em US$** por recurso e total |

### 4.2 Usuários
- Busca por **nome ou e-mail** e ordenação por: mais recentes, mais ativos, menor saldo, maior uso de IA.
- Paginação por cursor, de 25 em 25.
- Cada linha mostra: nome, e-mail, data de cadastro, **última atividade**, saldo de créditos, fotos e mensagens no período, se tem dieta ativa, sequência atual de dias e se entrou por convite.
- Sem dados de saúde: peso, altura, condições, refeições e conversas **não** aparecem.

### 4.3 Convites
- Topo: o fluxo atual (identificação, **Gerar convite**, **Compartilhar link**). Ao compartilhar, a mensagem pronta continua sendo "Seu convite para o calorIA com 15 créditos: <link>".
- Lista com filtro por status (Ativo, Resgatado, Expirado, Revogado). Cada convite mostra:
  - identificação, data e validade;
  - **quem resgatou** (nome e e-mail) e quando;
  - **quanto essa conta usou depois**: créditos gastos, fotos e mensagens desde o resgate.
- **Revogar** continua disponível para convite ativo.
- **"Gerar outro com a mesma identificação"** em cada item, para repetir o envio sem redigitar.

## 5. Requisitos

### Backend
- **R1 — `GET /admin/overview?days=7|30|90`**
  - Cada bloco da seção 4.1 vem com o valor do período e do período anterior.
  - Reaproveita as funções de `admin.service.ts` e acrescenta os blocos de créditos e convites.
  - Os blocos rodam em paralelo (`Promise.all`).
  - O schema Zod da resposta é validado.
- **R2 — `GET /admin/users?q=&sort=&cursor=&days=`**
  - `q` busca com `ILIKE` em `profiles.full_name` e `auth.users.email` (mínimo de 2 caracteres).
  - `sort` aceita: `recent` | `active` | `low_balance` | `ai_usage`.
  - Cursor opaco e estável; limite de 25 por página.
  - Por usuário: `id`, `name`, `email`, `created_at`, `last_activity_at`, `balance_units`, `photos`, `messages`, `has_active_diet`, `current_streak`, `joined_by_invite`.
- **R3 — `GET /admin/credit-invites` com acompanhamento**
  - Acrescenta à resposta atual:
    - `claimed_by_name`, `claimed_by_email` e `claimed_at` (de `credit_welcome_claims.created_at`);
    - `usage_since_claim: { debited_units, photos, messages }`, contados a partir do resgate.
  - Novo filtro `status`.
- **R4 — Definições** (para evitar ambiguidade na implementação):
  - **Última atividade:** o maior valor entre `meals.created_at`, `ai_usage.created_at` e `credit_operations.created_at` da conta. Login não conta, porque a renovação de token acontece sem ação do usuário.
  - **Ativo:** conta com pelo menos uma atividade (no mesmo sentido acima) na janela.
  - **Mensagens de voz:** `ai_usage.feature='transcribe'`. Mensagens de texto: chamadas `chat` menos as de voz. É uma aproximação, e a tela mostra isso numa nota.
  - **Créditos:** em unidades no banco (5 unidades = 1 crédito); a tela mostra créditos com uma casa decimal, como o app já faz.
  - **Custo estimado:** tokens × preço por modelo, numa tabela de preços versionada no código (`ai-prices.ts`). Os valores vêm da lista pública do OpenRouter, com data, e o card mostra "estimado". Modelo sem preço conhecido aparece como "sem preço".
- **R5 — Desempenho**
  - Índices novos, por migration: `credit_ledger(created_at)`, `credit_operations(user_id, created_at)`, `meals(user_id, created_at)` e `credit_welcome_claims(invite_id)`.
  - Meta: cada endpoint responde em menos de 1,5 s com 10 mil usuários. Se passar disso, a v2 adiciona agregação diária.
- **R6 — Segurança**
  - Todas as rotas ficam atrás de `registerAdminGuard`: 404 para não-admin, fail-closed.
  - E-mail e nome só saem nas rotas `/admin/*`.
  - As consultas leem `auth.users` só no backend.
  - Nenhum endpoint altera dados de usuário.
  - O acesso a `/admin/users` com `q` é registrado em log (admin, termo e quantidade de resultados), sem gravar resultados.

### App (OTA, sem build novo)
- **R7:** `AdminScreen` passa a ter três abas (Visão geral, Usuários, Convites). Cada aba carrega os seus dados ao ser aberta, e a recarga é por puxar para baixo.
- **R8:** Componentes de card, linha de usuário e item de convite seguem o tema atual. Os estados de carregamento, vazio e erro reaproveitam `ErrorState`.
- **R9:** O layout se adapta à largura: uma coluna no celular e grade de 2 a 4 colunas acima de 900 px. Na web, a tela usa a largura útil sem esticar o texto.
- **R10:** Acessibilidade:
  - cada card tem rótulo legível pelo leitor de tela (ex.: "Novas contas: 42, mais 12 por cento em relação ao período anterior");
  - alvos de toque de no mínimo 44 pt;
  - suporte a fonte ampliada.

### Privacidade
- **R11:** A política de privacidade passa a dizer que administradores do CalorIA podem ver dados de conta (nome, e-mail, datas de uso, saldo e contagem de uso) para operar o serviço. Os dados de saúde continuam inacessíveis pelo painel.

## 6. Critérios de aceite
1. Uma conta sem `is_admin` recebe **404** em `/admin/overview`, `/admin/users` e `/admin/credit-invites`, e não vê o item **Administração**.
2. Um admin vê os cinco blocos da visão geral para 7, 30 e 90 dias, cada um comparado ao período anterior.
3. A busca por parte do e-mail ou do nome encontra a conta. As quatro ordenações funcionam, e a paginação não repete nem pula contas.
4. Um convite resgatado mostra quem resgatou, quando, e o uso daquela conta desde o resgate.
5. O custo estimado bate com tokens × tabela de preços num teste com dados fixos.
6. Na largura de 1.280 px (web), os cards aparecem em grade. No iPhone 13, aparecem em uma coluna sem corte.
7. As suítes de backend (Vitest, incluindo PostgreSQL de créditos) e do app (Jest) continuam verdes. O fingerprint nativo não muda.

## 7. Fora de escopo (v2)
- Tela de detalhe do usuário (extrato e uso por dia).
- Gráficos ao longo do tempo.
- Exportação CSV.
- Lote de convites, crédito direto a usuário e envio por e-mail.
- Promoção de admin pela tela e níveis de permissão.
- Ações sobre contas (bloquear, redefinir senha).

## 8. Riscos
| Risco | Mitigação |
|---|---|
| Exposição de dados pessoais | Só nas rotas admin, sem dados de saúde, busca registrada em log, política de privacidade atualizada |
| Escalada de privilégio | Admin só por SQL; guard consulta o banco a cada request e falha fechado |
| Consultas lentas com mais usuários | Índices novos; meta de 1,5 s; agregação diária como plano B |
| Custo estimado diferente da fatura | Rótulo "estimado", tabela de preços datada; a fatura do OpenRouter continua sendo a fonte oficial |
| "Mensagens de voz" aproximadas | Nota na tela explicando o critério |

## 9. Entrega sugerida
1. **PR 1, backend:** `/admin/overview` + índices + tabela de preços.
2. **PR 2, backend:** `/admin/users` e `/admin/credit-invites` com acompanhamento.
3. **PR 3, app (OTA):** abas, cards, lista de usuários, convites com acompanhamento e layout para a web.
4. **PR 4:** atualização da política de privacidade.

Depois da aprovação desta spec, o próximo passo é o plano de implementação com as tarefas e testes de cada PR.
