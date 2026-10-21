# Diagnóstico de UI, scanner e convites — 18/10/2026

Base: `f5ca5bf` (PRs 69/70 integrados). Diagnóstico apenas: nenhum código de produção foi alterado. `docs/ota-updates.md` e o estudo de custo não versionado foram preservados.

## Resultado

Três comportamentos incorretos reproduzidos de forma determinística em Jest, exercitando os componentes/stores reais e controlando apenas as respostas externas. Os repros ficam fora das roots normais do Jest do app. As asserções descrevem o comportamento correto e **falham na base atual**: 3 falhas e 11 testes de controle passaram.

### P1 — confirmação do scanner atravessa logout e contamina a conta seguinte

- Origem: `app/src/features/scanner/store.ts:104`, especialmente as mutações após `await Promise.allSettled` nas linhas 136, 139 e 149.
- Cenário: A confirma refeição; antes da resposta, executa-se o `clearToken()` real e inicia-se a sessão B; B começa outro scan; a resposta do salvamento de A chega depois.
- Resultado observado: `currentUser="new-user"`, diário em memória de B contém `"Private meal of account A"`, `scannerItems=[]` e `scannerImage=null`. A conclusão antiga injeta a refeição de A no cache usado por Hoje/Diário e apaga a edição de B.
- Causa: `confirm()` não captura/verifica a geração da sessão nem a geração do scanner. `analyze()` já tem essas proteções, mas elas não cobrem `confirm()`.
- Impacto comprovado: mistura de dados entre contas no mesmo processo e perda do scan novo. O teste não alega que a API escreveu a refeição no banco da conta errada; essa etapa depende da autenticação capturada na requisição.
- Repro: `scanner-confirm-session.repro.test.ts`.
- Direção da correção: preservar sessão/proprietário e tentativa de scanner; após cada fronteira assíncrona, impedir qualquer mutação/alerta/navegação se a tentativa ficou obsoleta. Cobrir sucesso e falha parcial sem desfazer o controle existente de salvamentos parciais.

Trecho real do output:

```text
REPRO_SCANNER_SESSION_RESULT {"currentUser":"new-user","diary":[{"id":"old-meal","name":"Private meal of account A",...}],"scannerItems":[],"scannerImage":null}
Expected: []
Received: [{... old-meal ...}]
```

### P2 — retry do saldo mostra zero sem ter consultado o saldo

- Origem: `app/src/features/credits/components/CreditBalance.tsx:9` e `:20`; `app/src/features/credits/store.ts:36`.
- Cenário: recurso já conhecido como ativo; uma consulta anterior falhou e deixou `wallet=null`; inicia-se outra consulta, ainda pendente.
- Resultado: `load()` limpa `error` antes de obter a carteira. O componente ignora `loading` e faz `wallet?.available_units ?? 0`, exibindo **0 créditos disponíveis** enquanto o saldo é desconhecido.
- Output: `REPRO_BALANCE_RETRY {"loading":true,"wallet":null,"error":null,"displaysZero":true}`.
- Impacto: saldo inventado durante recuperação de rede; não é débito real no servidor.
- Repro: `credit-balance-loading.repro.test.tsx`.
- Direção: representar carregamento/saldo indisponível explicitamente enquanto não há carteira, mantendo os recursos desligados invisíveis como já ocorre.

### P2 — convite definitivamente indisponível continua oferecendo resgate

- Origem: `app/src/features/invites/screens/InviteScreen.tsx:84`–`:100` e bloco `preview`/botão de claim em `:143`.
- Cenário: prévia válida; antes de confirmar, o convite é revogado, expira ou é usado por outra conta; `/redeem` retorna 410 `INVITE_UNAVAILABLE`.
- Resultado: a mensagem corretamente pede novo convite, mas a prévia permanece e **Confirmar e receber créditos** continua habilitado. `REPRO_TERMINAL_INVITE {"actionable":true}`.
- Impacto: ação sem recuperação válida continua disponível e envia novas requisições destinadas a falhar. O backend continua negando; não foi encontrado bypass de resgate.
- Repro: `invite-terminal-action.repro.test.tsx`.
- Direção: invalidar a prévia ou manter estado terminal que desabilite o claim; preservar retry para falhas transitórias/ambíguas.

## Comando executado

No diretório `app`:

```sh
./node_modules/.bin/jest \
  --roots ../docs/qa/debug-2026-10-18 \
  --modulePaths "$PWD/node_modules" \
  --runTestsByPath \
  ../docs/qa/debug-2026-10-18/scanner-confirm-session.repro.test.ts \
  ../docs/qa/debug-2026-10-18/credit-balance-loading.repro.test.tsx \
  ../docs/qa/debug-2026-10-18/invite-terminal-action.repro.test.tsx \
  --runInBand --no-coverage
```

Output integral: [`ui-repro-output.txt`](./ui-repro-output.txt). Código de saída: **1**, esperado para os três defeitos descritos. Fixtures usam contas/dados sintéticos; nenhuma chamada de IA, autenticação ou banco real foi feita.

## Superfícies inspecionadas e limite visual

Foram inspecionados RootNavigator, intake/persistência de convite, InviteScreen, AdminScreen, créditos/saldo, perfil e entrada admin, dashboard/anel e fluxo Analyzing/confirm do scanner. Os guards de geração/foco de AdminScreen estão presentes; o ajuste de fonte/anel `d3a8367` também está presente. Não há evidência nesta revisão de escalada admin ou resgate duplo; esses assuntos exigem testes do backend/banco.

Não foram obtidas capturas nem reprodução no iPhone 13. Jest não calcula o layout nativo. Permanecem sem verificação visual: corte original, Dynamic Type máximo, VoiceOver/foco, teclado, tab bar, targets de toque, iPad/Split View e interrupções reais de áudio. A ausência de novos achados visuais neste relatório não constitui aceite dessas jornadas.
