# Spec — Bugs pós-lançamento (revisão completa do app)

**Contexto:** após a aprovação no Google Play, usuários relataram problemas na área de
login. Esta spec cobre a revisão da área de auth (feita manualmente, linha a linha) e a
revisão do restante do app do ponto de vista do usuário. Os 4 bugs de severidade alta
fora do auth foram verificados diretamente no código antes de entrar aqui.

**Total: 26 bugs** — 7 altos, 11 médios, 8 baixos.

Convenção de IDs: `A*` = auth/login · `B*` = alto (demais áreas) · `M*` = médio · `L*` = baixo.

---

## 1. Área de login — a origem provável das reclamações

### A1 — ALTA — "Esqueci minha senha" quebrado em produção
- **Onde:** `backend/src/shared/env.ts:23` · `app/src/features/auth/screens/ResetPasswordScreen.tsx:9-16` · `app/src/navigation/RootNavigator.tsx` (linking)
- **Causa:** três peças desalinhadas. (1) `PASSWORD_RESET_REDIRECT_URL` é opcional e não está configurada — sem ela o Supabase manda o link do e-mail para o **Site URL** do projeto (default `localhost:3000`). (2) `ResetPasswordScreen` só funciona na web: lê `window.location.hash`, inexistente no nativo. (3) O linking do app não registra rota de reset, e o prefixo `https://caloria.app` não é o domínio real.
- **Usuário vê:** esquece a senha → recebe o e-mail → o link abre localhost/página morta → nunca mais entra.
- **Correção:** configurar `PASSWORD_RESET_REDIRECT_URL` no Vercel apontando para `APP_WEB_URL/reset-password` e registrar essa URL nos Redirect URLs do painel do Supabase. O reset acontece na web (a tela web já funciona); nenhuma mudança de app é necessária para o fluxo mínimo.
- **Teste:** fluxo real — pedir reset com conta de teste, abrir o link do e-mail no celular, redefinir, logar no app com a senha nova.

### A2 — ALTA — E-mail com espaço no fim trava o botão Entrar
- **Onde:** `app/src/features/auth/screens/LoginScreen.tsx` e `RegisterScreen.tsx`
- **Causa:** teclados Android adicionam espaço no autocomplete. `isValidEmail` rejeita o espaço → `isFormValid` desabilita o botão (toque morto, sem feedback); o erro só aparece no `onBlur`. `ForgotPasswordScreen` faz `trim()`; Login/Register não.
- **Usuário vê:** e-mail aparentemente correto na tela, botão "Entrar" que não responde.
- **Correção:** `trim()` no `onChangeText` (ou na validação + no envio) das duas telas.
- **Teste:** unit — login com `"user@x.com "` deve habilitar o botão e enviar sem espaço.

### A3 — ALTA — Corrida no fim do onboarding: dashboard monta antes do perfil existir
- **Onde:** `app/src/features/auth/screens/ProfileSetupScreen.tsx` (`submitProfile`)
- **Causa:** `setToken()` roda **antes** do `await authService.profileSetup()`. `setToken` liga `isAuthenticated`, o `RootNavigator` troca a árvore na hora: o onboarding desmonta com o request em voo e o dashboard busca metas antes de o perfil ser salvo.
- **Usuário vê:** metas zeradas logo após o cadastro. Se o request falhar: conta autenticada sem altura/peso/objetivo para sempre (não há re-gate de perfil incompleto — o navigator só olha `isAuthenticated`).
- **Correção:** aguardar `profileSetup` **antes** do `setToken` (o interceptor já usa `pendingAuth.refreshToken` no 401, então a chamada funciona durante o onboarding); em falha, manter o usuário na tela com retry.
- **Teste:** unit — `setToken` só é chamado após resolução de `profileSetup`; falha não autentica.

### A4 — MÉDIA — Timeout/erro de rede vira "Credenciais inválidas"
- **Onde:** `LoginScreen.tsx` (`handleLogin`) · `app/.env` (`API_TIMEOUT=10000`)
- **Causa:** catch genérico; timeout de 10s é apertado para cold start do Vercel + Supabase.
- **Usuário vê:** senha certa, mensagem de credenciais erradas → tenta reset (e cai no A1).
- **Correção:** distinguir erro de rede/timeout de 401 na mensagem; avaliar timeout maior no login.

### A5 — MÉDIA — E-mail já cadastrado mostra erro genérico
- **Onde:** `RegisterScreen.tsx` (`handleRegister`)
- **Causa:** backend responde `409 EMAIL_ALREADY_EXISTS`; o app mostra "Não foi possível criar a conta".
- **Correção:** mapear 409 → "Este e-mail já está cadastrado" com atalho para o Login.

### A6 — BAIXA — Login/Register sem KeyboardAvoidingView
- Teclado pode cobrir campo de senha/botão em telas pequenas.

**Verificado e OK no auth:** persistência de sessão, contrato e dedupe do refresh, distinção
rede×auth no refresh, fallback `pendingAuth` no interceptor, cadastro com `email_confirm: true`.
Botões sociais ocultos por design (libs não instaladas) — só é problema se a ficha da loja
anunciar login com Google.

---

## 2. Severidade alta — demais áreas (verificados no código)

### B1 — Marcar refeição do plano "vira ao contrário" quando o dia da semana se repete
- **Onde:** `backend/src/modules/diets/diets.service.ts:346-357` · `app/src/features/diet/store.ts`
- **Causa:** o toggle no banco é `is_completed = NOT is_completed`, mas a UI exibe `completedToday`, derivado da **data** (`completed_at` cai hoje?). Uma refeição marcada na semana passada segue `is_completed = true` no banco, mas aparece desmarcada na tela.
- **Usuário vê:** toca em "Marcar como concluída", o card pisca e **desmarca**. Precisa tocar duas vezes — e o primeiro toque não conta streak (`update_user_streak` só roda quando o novo estado é `true`).
- **Correção:** derivar o novo estado da data (`completed_at::date = hoje local` → desmarcar; caso contrário marcar com `completed_at = NOW()`), não do booleano cru.

### B2 — Seção da dieta fica em esqueleto para sempre após falha de rede
- **Onde:** `app/src/features/diet/store.ts:19-27` · `DietPlanSection.tsx` · `DashboardScreen.tsx:84-86`
- **Causa:** `loadCurrent` engole o erro (`plan` fica `undefined` = estado de loading eterno) e o efeito do dashboard só refaz o fetch se `plan === undefined` na montagem.
- **Usuário vê:** cards cinzas pulsando indefinidamente; só resolve matando o app.
- **Correção:** estado `error` no store + componente de erro com retry (padrão `ErrorState` já existe).

### B3 — Check-in duplo em desafio ZERA a sequência
- **Onde:** `backend/src/modules/challenges/challenges.service.ts:275-298` · `ChallengesScreen.tsx:69`
- **Causa:** guarda `last_check_in === today` é check-then-act sem lock, e o botão de check-in não desabilita durante a chamada. Dois toques passam pela guarda; a segunda transação lê `last_check_in = hoje`, cai no `ELSE 1` e grava `current_streak = 1`. `total_days` incrementa dobrado.
- **Usuário vê:** tinha 5 dias de sequência, toca 2x, fica com 1.
- **Correção:** condição no próprio `UPDATE` (`AND last_check_in IS DISTINCT FROM ${today}`), `count === 0` → 409; e `loading/disabled` no botão.

### B4 — Refeição registrada em dia passado é salva em HOJE no servidor
- **Onde:** `app/src/features/food-log/hooks/useFoodLog.ts:32-35` · `food-log.service.ts:46`
- **Causa:** `handleAddMeal` não passa `date`; o serviço aplica `?? todayString()`. O cache local grava sob `selectedDate` — os dois divergem.
- **Usuário vê:** registra o almoço de "Ontem"; ao reabrir o app a refeição migra para "Hoje", inflando o total de hoje e esvaziando ontem.
- **Correção:** `foodLogService.addMeal({ ...data, date: store.selectedDate })`.

---

## 3. Severidade média

| ID | Bug | Onde | Correção |
|---|---|---|---|
| M1 | Erro do diário no dashboard nunca se recupera (sem retry; flag não reseta) | `DashboardScreen.tsx:64-87,180-186` | retry no card de erro; resetar flag ao refazer fetch |
| M2 | Scan com cache vazio "esconde" refeições anteriores do dia (fetch só quando `undefined`; sem pull-to-refresh) | `scanner/store.ts:99-102` · `DashboardScreen` · `useFoodLog` | refetch por staleness/foco + pull-to-refresh no dashboard e diário |
| M3 | Falha ao publicar post não mostra nada (comentário diz "Alert já disparado no store", mas o store não dispara) | `CreatePostScreen.tsx:43-50` · `feed/store.ts:81-91` | `showAlert` no catch do store (padrão de `toggleLike`) |
| M4 | **IDOR**: `GET /challenges/:id/leaderboard` entrega ranking (nomes + desempenho) de desafio privado sem checar participação | `challenges.routes.ts:106-121` | exigir vínculo de membro na query |
| M5 | Comentários: falha de carregamento mostra "Seja o primeiro a comentar" | `PostCommentsScreen.tsx:29-56` · `feed/store.ts:122-133` | estado de erro + retry |
| M6 | Total de calorias diverge: dashboard soma plano+diário; diário só diário, contra a mesma meta (e usa meta de hoje em dias passados) | `DashboardScreen.tsx:92-110` vs `FoodLogScreen.tsx:46-47,99` | unificar a regra de soma num util compartilhado |
| M7 | Confirmar scan com itens sem nome fecha o modal como se tivesse salvo (descarta tudo em silêncio) | `scanner/store.ts:76-115` | bloquear confirmação com 0 itens válidos e mostrar validação |
| M8 | Plano com geração incompleta vira "você não tem dieta" (`getTodayPlan` retorna `null` para ambos os casos) | `diets.service.ts:275` | distinguir "sem dieta" de "dia não gerado" e oferecer retomada do job |

## 4. Severidade baixa

| ID | Bug | Onde |
|---|---|---|
| L1 | Excluir refeição sem catch (falha silenciosa; sem guarda de toque duplo) | `useFoodLog.ts:37-40` · `FoodLogItem.tsx:38` |
| L2 | Busca de amigos: respostas fora de ordem sobrescrevem resultados; timeout não limpo no unmount | `friends/store.ts:60-73` |
| L3 | Pull-to-refresh do feed não reseta `hasError` → feed vazio legítimo exibido como erro | `FeedScreen.tsx:36,87-108` |
| L4 | Banner "Gerando sua dieta" congela se o polling esgota 30 iterações sem terminar | `coach/store.ts:185` |
| L5 | Post de marco de 7 dias não é best-effort → falha devolve 500 com check-in já commitado | `challenges.service.ts:300-311` |
| L6 | API aceita `endDate < startDate` (desafio nasce encerrado; UI atual não aciona) | `challenges.schemas.ts:55-60` |
| L7 | Busca de usuários não escapa `%`/`_` do ILIKE (`%%` lista 20 usuários arbitrários) | `friends.service.ts:29` |
| L8 | Streak só avança marcando refeição do PLANO — quem só usa diário/scanner nunca tem sequência (decisão de produto) | `diets.service.ts:363-367` |

## 5. Verificado e considerado OK (cobertura da revisão)

- **App:** navegação e deep links; interceptor de refresh; utils de data (sem bugs de fuso — datas locais corretas); `Button` bloqueia toque duplo onde é usado com `loading`; validação de macros do diário; otimismo com rollback no feed; polling de notificações; evolução/peso; leaderboard (tela); scanner (fluxo de análise).
- **Backend:** ownership correto em food-log, weight, feed, friends, notifications; rate limit e limites do scanner; geração de dieta dia-a-dia (concorrência otimista, draft até concluir, retry idempotente); `update_user_streak` idempotente por dia; error handler do server.
- **Fora do escopo desta revisão:** `modules/admin`, `modules/chat` (exceto o disparo de geração de dieta).

---

# Plano de execução

Ordem por impacto no usuário; cada fase é um PR independente com testes. As 11 falhas
de teste preexistentes do app permanecem como estão (nenhuma nova em cada fase).

### Fase 0 — Config de produção (hoje, sem release do app) → resolve A1
Definir `PASSWORD_RESET_REDIRECT_URL` no Vercel (backend) apontando para a página web
de reset e cadastrar a URL nos Redirect URLs do Supabase. **Precisa dos painéis
(Vercel + Supabase) — não é mudança de código.** Testar o fluxo real de ponta a ponta.

### Fase 1 — Hotfix do login (app) → A2, A3, A4, A5
Trim de e-mail nas duas telas; ordem correta no fim do onboarding (salvar perfil →
autenticar) com retry em falha; mensagens distinguindo rede×credenciais; 409 → mensagem
com atalho para o login. **Release novo no Play** (versionCode 8; manter um único
artefato na versão, como no lançamento).

### Fase 2 — Integridade de dados → B1, B3, B4, M6
Toggle da refeição por data (backend + ajuste do otimismo no app); check-in atômico +
botão com loading; `date` explícito no registro de refeição; regra única de soma de
calorias. São os bugs que corrompem/distorcem dados do usuário — antes dos de UX.

### Fase 3 — Estados presos e erros silenciosos → B2, M1, M2, M3, M5, M7, M8, L4
Padrão único: todo load de tela tem `error` no store + retry na UI; pull-to-refresh no
dashboard e no diário; validação no confirmar do scan; distinguir dieta ausente de dia
não gerado.

### Fase 4 — Backend hardening → M4, L5, L6, L7
Vínculo de membro no leaderboard (IDOR); best-effort no post de marco; validação cruzada
de datas; escape de curingas no ILIKE.

### Fase 5 — Polimento → A6, L1, L2, L3, L8
L8 depende de decisão de produto: streak deve contar diário livre/scanner? Se sim, mover
o gatilho de streak para o registro de refeição em geral.

### Pendências que não são código
- Fase 0 exige acesso aos painéis Vercel/Supabase (usuário).
- L8: decisão de produto (streak com diário livre).
- Se a ficha do Play anunciar login com Google: ou instalar as libs sociais (SHA-1 do
  Play App Signing incluído) ou ajustar a ficha.
