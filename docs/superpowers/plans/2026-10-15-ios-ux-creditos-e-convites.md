# Plano — iOS sem cortes, créditos e convites

Data: 15/10/2026. Base inspecionada: main `2bbf30c`.
Spec: [2026-10-15-ios-ux-creditos-e-convites.md](../specs/2026-10-15-ios-ux-creditos-e-convites.md).
Estado: **implementado localmente em etapas; validação de aparelho e ativação remota pendentes**. A inspeção de fonte e as limitações de captura estão registradas na spec. Nenhum checkbox abaixo comprova reprodução no iPhone 13.

## Execução de 15/10/2026

O pedido “execute” iniciou a implementação das propostas D1/D2/D4 com flags desligadas. Foram preparados layout iOS, política inteira, schema, proteção de admin, carteira transacional, rotas, scanner/coach, telas de saldo/admin e entrada de convites. A matriz D3 permanece em aberto: nenhum preço de dieta/áudio ou saldo para legados foi presumido.

Os checkboxes originais abaixo são critérios de aceite, incluindo evidências nativas e remotas ainda não obtidas; não indicam ausência de código quando permanecem abertos. Evidência e pendências por jornada: [QA iOS](../../qa/ios-ux-2026-10-15/README.md). Procedimento, testes e limites: [runbook de créditos](../../qa/ios-ux-2026-10-15/creditos-runbook.md).

## Objetivo e ordem

**Release A:** corrigir e verificar o iOS, começando pela tela inicial do iPhone 13, sem esperar a carteira.
**Release B:** carteira transacional + admin/convites + clientes com saldo e idempotência, inicialmente com flags off.
**Ativação C:** somente depois de decidir D1–D4, validar permissões e cobrir clientes antigos.

Stack conferida: React Native 0.85/Expo 56/TypeScript/Zustand/React Navigation; backend Fastify/Zod/postgres.js/Supabase; Jest no app, Vitest/Biome no backend; GitHub Actions e Vercel/EAS já existentes. Não executar comandos de uma stack RN 0.77 que apareça em documentos antigos.

## Restrições globais

- Preservar mudanças não relacionadas, inclusive estudo de custo local não versionado. Conferir `git status`, `git worktree list` e instruções de diretório; usar worktree limpo se necessário; staging explícito.
- Não executar este plano como um único PR gigante. Cada tarefa entrega algo revisável e seus testes. Corrigir iOS antes de ativar cobrança.
- Sem refazer identidade visual, trocar rotas, desabilitar escala de fonte, adicionar native deps ou scripts em `app/package.json` por conveniência.
- Arquivos de créditos/admin/listas de testes abaixo são **novos propostos**; os demais foram encontrados na árvore. Não chamar endpoints propostos como se já existissem.
- Migrações apenas aditivas e rastreáveis. Gerar pelo CLI Supabase após conferir `--help`/versão; não escolher manualmente número/timestamp, não alterar migrations históricas nem aplicar no projeto remoto durante preparação local.
- `ai_usage` continua telemetria; carteira não pode ser best-effort. Falha de saldo impede inferência. Não usar float.
- Segredos, fotos, vozes, prompts e tokens de convite fora de logs/fixtures/commits. Nada de distribuir convites reais automaticamente.
- Testes de locks/concorrência/RLS precisam de PostgreSQL real isolado; mocks não bastam. Não usar banco de produção como fixture.

## Gate de decisões

- [ ] Confirmar **D1**: 0,2 crédito/mensagem ou blocos inteiros. O desenho abaixo assume frações **como proposta**, sem ativar cobrança por silêncio.
- [ ] Confirmar **D2**: cobrança por sucesso; falha/sem comida/segurança não debitam.
- [ ] Confirmar **D3**: geração de dieta, transcrição, guest, usuários atuais e preço em reais. Não inventar tarifa zero nem pagamentos.
- [ ] Confirmar **D4**: convite único, 7 dias, welcome uma vez por conta, elegibilidade de contas existentes.

Pode avançar a Release A sem essas decisões. Tabelas/contratos da Release B podem ser preparados com flags off; integração/ativação seguem os gates da spec.

---

## Task 1 — Reproduzir e delimitar o corte no iPhone 13

**Arquivos/evidência:** novo `docs/qa/ios-ux-<data>/README.md` e capturas numeradas; sem corrigir componentes antes de identificar o estado.

- [ ] Obter captura/gravação do aparelho do usuário ou ambiente iOS reproduzível. Registrar build/update/runtime, iOS, orientação, tamanho de texto, Negrito e Zoom. Distinguir Welcome de Hoje autenticado.
- [ ] Capturar o estado instalado antes de forçar atualização; conferir se o update com `autoLineHeight` está de fato aplicado. Publicação EAS não prova instalação.
- [ ] Reproduzir nos estados default e fonte grande; conferir bordas, notch, CTA final e barra inferior. Salvar o screenshot exato, abrir o arquivo e rejeitar captura errada/loading.
- [ ] Listar achados por tela, severidade, reprodução e critério de correção; mapear o sintoma ao código. Caso só fonte possa ser inspecionada, marcar como risco, não defeito visual comprovado.

**Saída:** cenário que falha, captura do antes e hipótese falsificável. Sem iPhone/simulador acessível, este gate fica pendente; o planejamento das outras tarefas continua, mas não declarar o bug corrigido.

## Task 2 — Corrigir a raiz do layout iOS

**Existentes a inspecionar/modificar conforme reprodução:**
- `app/src/features/dashboard/screens/DashboardScreen.tsx`
- `app/src/features/food-log/screens/FoodLogScreen.tsx`
- `app/src/features/profile/screens/ProfileScreen.tsx`
- `app/src/shared/components/Text.tsx`, `ScreenShell.tsx`, `index.ts`
- `app/src/navigation/BrandTabNavigator.tsx`
- Welcome/Login/Register/ProfileSetup e componentes MacroCard/CalorieRing se as capturas demonstrarem falha.

**Testes existentes:** `DashboardScreen.test.tsx`, `FoodLogScreen.test.tsx`, `ProfileScreen.test.tsx`, `Text.test.tsx`, `CalorieRing.test.tsx`, testes de auth. Criar teste do comportamento de inset/layout onde não existir.

- [ ] Criar regressão do caso observado antes da correção; no Jest verificar contrato de insets/props/layout, sem alegar que snapshot prova ausência de corte nativo.
- [ ] Usar insets reais já disponíveis. Se necessário, criar helper pequeno de layout de tela; `ScreenShell` hoje limita largura, não é SafeAreaView, portanto não mudar sua semântica global sem testar os consumidores.
- [ ] Resolver line height/constraints de forma localizada. Preservar o `autoLineHeight` existente; não introduzir `allowFontScaling=false`, `numberOfLines=1` ou fonte minúscula para esconder conteúdo.
- [ ] Validar larguras compactas, alto contraste/números, nomes longos, fonte grande e conteúdo rolável; impedir sobreposição entre valor calórico e anel.
- [ ] Corrigir em lote os problemas evidenciados de topo/rodapé/teclado; manter navegação e ações. Não criar mais uma aba inferior para câmera, créditos ou admin.

**Comandos:** no app, `npx jest <testes alterados> --runInBand`, `npx tsc --noEmit`, `npx eslint <arquivos alterados>`. Confirmar visualmente no mesmo aparelho/estado do antes.

## Task 3 — Pente-fino iOS e Release A independente

- [ ] Executar/capturar os passos 1–7 da matriz R-IOS-03, registrando saúde de cada jornada, riscos de acessibilidade e limites de evidência. Fazer uma rodada agrupada, corrigir os achados e uma rodada de confirmação, sem loop indefinido de polimento.
- [ ] Conferir teclado, VO/foco, targets 44 pt, Dynamic Type e contraste real; voz com blur, bloqueio, Central de Controle, chamada e silencioso.
- [ ] Rodar testes/typecheck completos do app e web build; gates de fontes Android/iOS; bundle Android release. Conferir Android/web para regressão de layout.
- [ ] PR exclusivo da correção iOS, com imagens antes/depois e cenários manuais. Não misturar carteira nessa entrega.
- [ ] Comparar fingerprints antes/depois. Se só JS/layout, usar fluxo OTA existente e seus runtimes compatíveis; conferir manifests **e instalação** no aparelho. Se houver mudança nativa, preparar novo binário em vez de prometer OTA.
- [ ] Usuário confirma o iPhone 13 sem cortes. Sem esse resultado, documentar o limite e manter o aceite de aparelho aberto.

**Saída:** iOS corrigido e verificado, ou bloqueio explícito de evidência; fase de créditos não é substituto dessa correção.

---

## Task 4 — Proteger permissão admin antes de emitir saldo

**Existentes:** `backend/src/shared/require-admin.ts`, `.test.ts`, `modules/users/users.schemas.ts`, `users.service.ts`, `supabase/migrations/001_profiles.sql`, `015_admin.sql`.
**Novos:** teste de integração de permissões e migration gerada para proteção de privilégios (se necessária).

- [ ] Inventariar acesso direto a profiles e grants de tabela/coluna/roles, policies e funções em ambiente de teste; conferir estado remoto somente com consulta autorizada. Não executar auto-promoção em produção.
- [ ] Demonstrar em banco isolado se `authenticated` consegue alterar/inserir `is_admin`; teste deve falhar antes da proteção quando houver permissão vulnerável.
- [ ] Remover escrita em campos privilegiados por clientes. Não confiar só em RLS por proprietário nem em `REVOKE UPDATE(is_admin)` se ainda houver privilégio de UPDATE da tabela. Preservar funcionalidades legítimas pelo backend.
- [ ] Assegurar que schemas de atualização de perfil continuam rejeitando `is_admin`; se exposto para navegação, acrescentar apenas ao response do próprio perfil e ao tipo mobile.
- [ ] Testar usuário comum, anon, admin legítimo, JWT adulterado, erro de DB, acesso direto PostgREST e funções. Revalidar a revogação em cada request pelo guard existente.

**Saída:** fonte de permissão não editável pelo usuário; gate obrigatório antes da Task 8/ativação de convites.

## Task 5 — Definir política de créditos como módulo puro

**Novos propostos:** `backend/src/modules/credits/credit-policy.ts`, `.test.ts`, `credits.schemas.ts`.

- [ ] Implementar somente D1/D2 decididas, com policy_version. Proposta: 1 crédito = 5 unidades; scan=15, mensagem=1, turno normal=2, welcome=75.
- [ ] Testar exemplos da spec: 15→12→11,6; sem arredondamentos; não aceitar unidade negativa/NaN/preço do cliente.
- [ ] Classificar mensagens visíveis faturáveis e excluir system/tool/markers/loading/retry/onboarding. Definir resultado de recusa de segurança e tool de dieta sem duplicar marcadores.
- [ ] Congelar a matriz de todas as rotas de IA conforme D3 antes do enforcement; incluir `/chat/transcribe`, criação de job, `/diets/jobs/:id/step` e `/retry`. Não habilitar uma rota cara inadvertidamente fora do saldo.
- [ ] Documentar conversão apenas para exibição; preço em reais e pacote pago não fazem parte dessa implementação.

**Saída:** cálculo determinístico, sem acesso ao provedor/DB e sem tarifar tokens de execução.

## Task 6 — Schema aditivo e harness PostgreSQL

**Novos propostos:** migration gerada para carteiras/operações/ledger/convites; `backend/src/modules/credits/credits.repository.ts`; testes de integração; fixture/harness de DB isolado; job CI de integração se ausente.

- [ ] Conferir CLI `supabase --help` e subcomandos/version; inventariar migrations aplicadas, inclusive numeração legada duplicada. Gerar nova migration no diretório `backend/supabase/migrations` com o CLI; não renomear históricas.
- [ ] Criar as quatro tabelas da R-CR-03, constraints inteiras, idempotência única, índices e políticas/grants. Grant welcome único por usuário e vínculo único com convite/ledger.
- [ ] Definir retenção/pseudonimização na exclusão de conta; atualizar `deleteUserAccount` apenas se necessário para não apagar auditoria nem impedir exclusão legítima.
- [ ] Montar PostgreSQL de teste descartável (serviço CI ou Supabase local), com usuários/roles fictícios. Usar `TEST_DATABASE_URL` novo e exclusivo do harness; negar execução de fixtures contra host/projeto de produção.
- [ ] Aplicar a migration duas vezes conforme suporte/idempotência adotada e testar constraints, leituras/escritas como cada papel, usuário A vs B e deleção de conta. Não usar mock de query como prova de RLS.
- [ ] Auditar advisors/regras Supabase aplicáveis antes de preparar a migration remota. Nenhuma aplicação remota nesta etapa.

**Saída:** schema e testes reais de isolamento, sem dados de produção e sem saldo grátis automático para toda a base.

## Task 7 — Reserva, liquidação, liberação e idempotência

**Novos:** `credits.service.ts`, `credits.routes.ts`, testes unitários/integração e reconciliador interno conforme infraestrutura existente.
**Existentes:** `backend/src/server.ts`, `shared/env.ts`, `shared/errors.ts`.

- [ ] Implementar `reserve`, `settle`, `release`, `getWallet`, `getOperation`, `getLedger`. Transação curta e ordem fixa de locks; chamada à IA fora da transação.
- [ ] Mesma key/payload retorna operação existente; key/payload diferente →409; resultado de terceiros →404. Não reexecutar IA para operação running/uncertain.
- [ ] Liquidar saldo/ledger e persistência do resultado em uma transação; armazenar referência recuperável. Duplicatas devem retornar o recibo da operação, não debitar outra vez.
- [ ] Implementar falha fail-closed, 402 com saldo/custo, 503 em indisponibilidade, limites e paginação por cursor. Adicionar schemas de erros e header `Idempotency-Key` ao CORS.
- [ ] Reconciliar reservas abandonadas com evidência/lease; definir deadline e fencing para bloquear commit tardio antes de liberar uma tentativa encerrada. Não reexecutar inferência e não deixar saldo preso indefinidamente. Expor estados pendentes e alerta de idade para operação/suporte, sem endpoint público de ajuste livre.
- [ ] Adicionar flags novas `CREDITS_ENFORCEMENT_ENABLED`/`CREDIT_INVITES_ENABLED` false por default; false não muda saldo existente nem remove ledger.

**Testes reais:** duas requisições disputando exatamente 3 créditos → só uma reserva; 20 requests com mesma key → um efeito; settle/release repetidos → um efeito; corrida settle-vs-release; queda antes/depois de persistir resultado; timeout de DB; reconciliação sem execução dupla.

## Task 8 — Convites e rotas admin

**Novos:** `backend/src/modules/credit-invites/{credit-invites.service,credit-invites.routes,credit-invites.schemas}.ts` e testes; `modules/admin/admin.routes.ts`.
**Reuso:** `require-admin.ts`, serviço de métricas/schema existentes apenas no host necessário.

- [ ] JWT + guard admin em ordem correta; registrar rotas no server. Usuário comum recebe404. Autorização não depende do botão mobile nem do token do convite.
- [ ] Emissão server-side de token 32 bytes; hash apenas, grant fixo75 unidades, TTL7 dias e uso único se D4 aprovada. Adicionar idempotência de criação; a resposta com link é recuperável só conforme política segura de emissão (ver nota abaixo).
- [ ] Listar/revogar com paginação e auditoria; nenhuma alteração de valor/quantidade de usos fornecida pelo cliente. Sem email/WhatsApp automático.
- [ ] Preview público via POST/body, rate limited, sem side effects ou dados pessoais. Claim autenticado e atômico de link + welcome + wallet; usar sessão como user_id.
- [ ] Testar link inválido/expirado/revogado, duplicata de claim, duas contas concorrentes, segunda promoção para mesma conta, conta existente elegível/não elegível e idempotência que não queima link.
- [ ] Proteger token de logs, referrer e histórico de requests HTTP. URL web usa fragmento, nunca token em path/query. Não confiar no email autoconfirmado atual como verificação de posse.

**Nota de emissão/idempotência:** hash-only e “devolver link uma única vez” não permitem recuperar o token de uma resposta perdida. Não fingir que o hash pode ser revertido. Repetição de criação retorna status/ID da emissão e orienta revogar/reemitir; não armazenar token reversível por conveniência. Nenhum duplo grant é permitido.

## Task 9 — Integrar scanner e coach sem dupla cobrança

**Existentes:** scanner service/routes/schemas; chat service/routes/schemas; `chat.service.finish.test.ts`, `chat.service.gating.test.ts`, `fake-fastify.ts`; diets/jobs/transcribe conforme D3.

- [ ] Cobrir cada integração com teste que falha antes da cobrança correta, usando provedor fake e contador de invocações.
- [ ] Scanner: chave antes de inferência/cache; reserva3, sucesso líquido3, erro/sem comida libera conformeD2. Separar salvar/editar (grátis) de analisar. Cache não duplica débito da mesma operação.
- [ ] Chat: reservar o turno normal completo (2unidades sobD1), preservar o schema de histórico, persistir/liquidar atomicamente. Marcadores internos e retries de reasoning não consomem novas unidades.
- [ ] Serializar envios da mesma conversa com mecanismo durável e lease; duas abas/aparelhos não podem perder histórico ou executar duas tools. 409 em concorrência deve ser recuperável pelo cliente.
- [ ] Tool de dieta: associar operation_id ao job para uma repetição não criar segundo plano. Integrar custo dos steps só conformeD3; transcrição não duplica contagem do texto enviado.
- [ ] Guardar compatibilidade com clientes anteriores até rollout decidido; não criar caminho sem carteira para contornar saldo. Envio sem chave após enforcement exige atualização, não inferência grátis.
- [ ] Testar retorno tardio após blur/background/logout, perda da resposta HTTP, persistência falhando, retry do SDK e do app, saldo0/0,2/0,4/2,8/3 e pedidos paralelos.

**Saída:** resultado funcional idêntico ao anterior, com recibo/operation_id aditivos e cobrança uma única vez.

## Task 10 — Saldo e tratamento de crédito no app

**Novos:** `app/src/features/credits/{store.ts,screens/CreditsScreen.tsx,components/CreditBalance.tsx}`; `shared/services/credits.service.ts` e testes.
**Existentes:** `shared/services/api.ts`, scanner/coach services/stores, Profile/Dashboard/Coach, `useVoiceMessage.ts`, navigation/types/RootNavigator.

- [ ] Wallet por usuário, estado loading/error/reserved/available e extrato. Limpar na troca de sessão; resultado tardio não altera outra conta.
- [ ] Tarifa e saldo vindo do backend; formatação decimal localizada; não calcular saldo final com subtração otimista irreversível.
- [ ] Chaves UUID de operação estáveis durante retry/reabertura; recuperar operações pendentes e resultados. Hash da foto não substitui a chave do ato do usuário.
- [ ] Exibir “Analisar foto · 3 créditos”, explicação do chat e aviso de saldo insuficiente antes da ação. Backend continua decidindo em race.
- [ ] Tratar 402/503/409 explicitamente no scanner, coach e voz; preservar rascunho/resultado recuperável. Não mostrar falha de crédito como erro genérico de microfone.
- [ ] Não adicionar tab inferior. Saldo abre tela no stack a partir de Perfil/Hoje/Coach; leitor de tela anuncia saldo/estado, sem repetir a cada render.
- [ ] Testes com wallet atrasada/erro, usuário trocado, refresh de token, operação pendente, stale balance, navegação e Dynamic Type.

## Task 11 — Host admin e aba Convites e créditos

**Novos:** `app/src/features/admin/screens/AdminScreen.tsx`, `components/CreditInvitesTab.tsx`, `shared/services/admin.service.ts` e testes.
**Existentes:** ProfileScreen, profile.service.ts, backend users schemas/service, navigation/types/RootNavigator.

- [ ] Conectar a flag de admin read-only na resposta de perfil; não permitir alterar o campo nos inputs. Cliente antigo sem campo continua sem acesso visual.
- [ ] Criar host de admin mínimo e aba pedida, reaproveitando padrão de cards/listas/formulários. Visão geral de métricas só se fizer parte do host existente/necessário, sem reimplementar todo dashboard planejado em agosto.
- [ ] Formulário com identificação interna opcional, benefício fixo15, validade; gerar e mostrar link de uma única emissão; copiar/compartilhar manualmente com confirmação visual.
- [ ] Lista paginada de status, data, autor e resgate, revogação de link ativo, loading/empty/error/retry. Não expor tokens completos em listagem nem prometer recuperar link a partir do hash.
- [ ] Revalidar permissão revogada, erro de serviço, double tap e criação cuja resposta se perdeu. Não duplicar emissão por retry cego.
- [ ] Validar iPhone/iPad/web; controle não deve ficar escondido atrás de teclado nem estourar largura por URL longa. Testes de acesso e fluxo com serviço fake.

## Task 12 — Landing e preservação do convite durante auth

**Novos:** `app/src/features/invites/{screens/InviteScreen.tsx,store.ts}` e serviço; testes de linking/claims.
**Existentes:** RootNavigator/types, auth/store, telas Login/Register/ProfileSetup, web entry/config conforme necessário.

- [ ] Resolver rota pública `/convite` e fragmento do link sem depender do bypass `?preview=app` (que é somente de desenvolvimento).
- [ ] Mostrar benefício, estados e conta atual; login/cadastro/abrir app, sem consumir ao visualizar. Pedido de claim é explícito e autenticado.
- [ ] Persistir token pendente por auth/onboarding/cold start. Logout/troca de conta não resgatam silenciosamente na conta seguinte; apresentar confirmação da conta.
- [ ] Com app instalado, tratar `caloria://invite/<token>` e redigir token de logs. Web→app pode usar o esquema já registrado; não simular associação HTTPS nativa.
- [ ] Sem app: ativar no fluxo web suportado e depois instalar/entrar, ou orientar voltar ao convite após instalação. Usar URLs reais das lojas verificadas. Não prometer deferred deep link automático.
- [ ] Não habilitar Apple/Google web se os SDKs nativos atuais não suportarem essa jornada; email/senha existente é fallback explicitamente funcional.
- [ ] Testar novo/existente, app aberto/fechado, sem app, cancelamento de login, autenticação pendente, segunda conta, token expirado/revogado e falta de rede no retorno do claim.

**Fase opcional nativa separada:** Universal Links/App Links + arquivos de associação + novo build. Fazer só quando exigido/selecionado; não misturar com a correção iOS em JS.

## Task 13 — Harness integrado, revisão e canário

- [ ] Unitários de política, serviços e componentes, integração real PostgreSQL de saldo/ledger/grants/locks e API (JWT/admin/codes/CORS).
- [ ] Integrar pipeline de testes DB ao CI em banco efêmero; não exportar secrets de produção nem copiar a base real.
- [ ] Executar o fluxo: admin cria link → usuário abre → entra/cadastra → recebe15 uma vez → foto →12 → turno →11,6 sobD1 → segundo aparelho mostra mesmo saldo → zerar via usos legítimos → negar antes da inferência.
- [ ] Repetir com perda de HTTP, request concorrente, logout em voo e callback tardio; conferir ledger, contadores, número de chamadas ao provedor e histórico preservado.
- [ ] Capturar novas telas nos aparelhos da matriz iOS e Android/web; garantir que saldo/avisos não reintroduziram o corte inicial.
- [ ] Rodar backend test/typecheck/build/Biome dos arquivos alterados; app Jest/TypeScript/lint alterado, build:web e bundle Android release; gates de fontes existentes.
- [ ] Canário pago mínimo só com autorização de execução de integração/release, já com carteira e conta de teste controlada; não tratar mock como prova de integração real nem gastar saldo de usuário real.

## Task 14 — Entrega e ativação ordenada

- [ ] Release A de iOS concluída com aceite de aparelho registrado.
- [ ] D1–D4 resolvidas e versão da política congelada; admin is_admin protegido; API e migrations revisadas; sem dados destruídos.
- [ ] Preparar migration/rollback e inventário da base; aplicar remotamente somente na fase de entrega autorizada, registrando projeto e histórico. Merge não aplica SQL.
- [ ] Deploy backend com flagsfalse; publicar clientes compatíveis via web/OTA conforme fingerprint; conferir cohorts iOS/Android e caminho guest decidido. Não ativar em cima de clientes que ainda furam idempotência.
- [ ] Habilitar convites para admin piloto, resgate real de teste e reconciliação; então habilitar enforcement no cohort autorizado. Flags e cohort no servidor, não uma constante no app.
- [ ] Conferir CI, Vercel READY/commit/HTTP, manifests/runtime e validação do iPhone13 como provas separadas; nenhuma dessas sozinha comprova a outra.
- [ ] Monitorar saldo/reserva negativa (deve ser impossível), entradas duplicadas (zero), idade de reservas, 402/503, claim falho e divergência ledger/wallet. Alarmes sem dados pessoais.
- [ ] Registrar runbook de emissão manual, link perdido, resgate repetido, saldo pendente, rollback e reconciliação. Sem apagar ledger ou conceder saldo arbitrário para “destravar”.

## Verificação dos documentos antes da implementação

- [x] Revisar que o cálculo 5 mensagens inclui ambos os lados, e que os exemplos/inteiros batem.
- [x] Revisar conflito entre hash-only e recuperação de link; não implementar promessa impossível.
- [x] Revisar todas as rotas que geram custo, o guest e a mudança para contas existentes.
- [x] Revisar evidência iOS: nenhum checklist pode ser marcado como testado sem captura/aparelho.
- [x] Manter a distinção entre crédito de uso, custo do provedor e eventual preço de venda.
