# Relatório de debug — CalorIA

**Data:** 18/10/2026 · **Base:** `main`, commit `f5ca5bf`.

## Conclusão

Foram encontrados **8 problemas reproduzidos**, sendo **3 de prioridade alta (P1)** e **5 de prioridade média (P2)**, além de **um risco financeiro condicional**. A prioridade principal é impedir respostas e requisições de uma conta de atravessarem a troca para outra conta e preservar a recuperação dos resultados já concluídos.

Os testes existentes estão verdes, mas não cobriam os cenários adicionais de concorrência, troca de conta e espera por locks. Não foi demonstrada cobrança duplicada real, exploração externa ou ocorrência desses defeitos em produção.

**Nenhuma correção, migration remota, publicação ou alteração de configuração de produção foi executada.** Foram produzidos relatório, testes de diagnóstico e evidências locais. As alterações anteriores em `docs/ota-updates.md` e o estudo de custos não versionado foram preservados.

## Resumo dos achados

| ID | Prioridade | Problema | Evidência e condição |
|---|---|---|---|
| D01 | P1 | Refeição de uma conta aparece no diário local da conta seguinte; o novo scanner é apagado | Stores/autenticação reais, resposta de salvamento atrasada após logout/login |
| D02 | P1 | Resultado concluído perde sua chave de recuperação ao trocar de conta | Coach e scanner com stores reais; resposta/limpeza local em andamento |
| D03 | P1 | Requisição antiga pode receber as credenciais da nova conta | Axios e interceptor reais, troca de sessão controlada entre verificação e despacho |
| D04 | P2 | Duas abas podem apagar metadados de solicitações pendentes uma da outra | Dois runtimes isolados compartilhando armazenamento; leitura/escrita concorrente |
| D05 | P2 | Exclusão de conta pode falhar com chaves idempotentes válidas | PostgreSQL real; colisão na atualização do trigger de exclusão |
| D06 | P2 | Expiração pode ser ignorada após espera por lock | PostgreSQL real; liquidação de reserva e resgate de convite após o prazo |
| D07 | P2 | Interface mostra zero créditos enquanto o saldo é desconhecido | Componente/store reais durante nova consulta após erro de rede |
| D08 | P2 | Convite indisponível continua oferecendo botão de resgate | Prévia válida seguida de resposta 410 ao resgatar |

P1 significa corrigir antes de considerar esses fluxos seguros para uso entre contas ou ativação da cobrança. P2 indica erro funcional que deve ser corrigido, com condições específicas registradas abaixo. Essas prioridades não são classificações CVSS.

## D01 — Contaminação do diário e perda do novo scanner

**Fonte:** `app/src/features/scanner/store.ts:104`, mutações nas linhas 136, 139 e 149.

**Reprodução:** A confirma uma refeição; a resposta fica pendente; ocorre logout real e login como B; B inicia outro scan; chega a resposta do salvamento de A.

**Observado:** o usuário atual é B, mas seu diário em memória contém a refeição privada de A. Os itens e a imagem do scanner de B são apagados. O cenário foi reproduzido tanto no store quanto com o interceptor Axios real e adapter local.

**Causa:** `confirm()` continua alterando os stores depois de `await Promise.allSettled()` sem validar proprietário, geração da sessão ou tentativa de scanner. As proteções presentes em `analyze()` não protegem o salvamento.

**Limite:** comprovada mistura no cache/interface; não foi comprovada gravação da refeição no banco da conta B.

**Direção de correção:** capturar identidade e tentativa antes de salvar; invalidar efeitos posteriores se qualquer uma mudar. Proteger também falha parcial, mensagens de erro e navegação; manter a prevenção de duplicidade já existente no salvamento parcial.

## D02 — Recuperação perdida após resultado concluído

**Fontes:** `app/src/shared/services/coach.service.ts:124` e `app/src/shared/services/scanner.service.ts:94`.

O serviço executa `finishRequest()` antes de conferir se a sessão ainda é a original. Essa função marca a chave como concluída e remove os metadados. Depois, a resposta é descartada por pertencer a uma sessão antiga.

**Reproduções:** primeiro turno de texto do coach iniciado por A, seguido de logout/login B antes da resposta; e scanner com AbortSignal real, com a troca de conta ocorrendo durante a limpeza assíncrona posterior à resposta. Em ambos, a pendência de A passa de uma para zero e o resultado não é aplicado à interface. No primeiro turno do coach, o novo ID da conversa também não chega ao store.

**Impacto:** mesmo que o backend tenha guardado o resultado e liquidado corretamente, o usuário pode perder o caminho de recuperação na interface. Não se afirma que o resultado foi apagado do servidor; a reprodução de cliente usa resposta sintética de sucesso, sem cobrança real.

**Direção:** validar sessão antes de encerrar a pendência; se o resultado não foi entregue ao proprietário, manter uma referência recuperável. Considerar também mudança de sessão durante a própria limpeza e migração das pendências já órfãs.

## D03 — Credenciais podem mudar entre validação e envio

**Fontes:** `app/src/shared/services/api.ts:33`, especialmente as linhas 38–42; guards dos serviços de scanner/coach.

Os serviços verificam a identidade original, mas o interceptor assíncrono lê novamente a sessão atual e grava essa nova geração na configuração. Uma troca de conta entre essas etapas permite associar o payload antigo ao token novo.

**Evidência:** o adapter Axios local recebeu o payload de A com `Authorization` de B. A troca foi inserida numa fronteira controlada de microtasks; os stores de autenticação, serviços e interceptor são os reais. Não foi feita transmissão externa de dados.

**Condição:** uma corrida no despacho, não o simples ato de trocar de tela. O AbortSignal do scanner pode impedir determinados agendamentos. O cenário também foi confirmado chamando `useCoachStore.sendMessage()` de texto, sem Signal como no fluxo real: a mensagem de A chegou ao adapter com o token de B, mesmo sendo descartada posteriormente pelo store. A evidência não mede frequência em uso real.

**Direção:** vincular identidade/geração à criação da requisição e rejeitar no interceptor se estiver obsoleta, em vez de substituir silenciosamente sua identidade. Não usar o token atual como autorização para um payload de outra sessão.

## D04 — Pendências sobrescritas entre abas

**Fonte:** `app/src/shared/services/operation-requests.ts:27` e `:59`–`:78`.

A fila `writes` serializa apenas chamadas dentro de um runtime. Duas abas têm filas diferentes e podem ler o mesmo estado antes de cada uma gravar sua lista. A última gravação elimina a pendência criada pela outra.

**Repro:** dois módulos isolados, mesmo armazenamento e respostas de I/O controladas; depois de criar uma pendência de foto e outra de chat, sobra apenas uma. Isso demonstra o algoritmo concorrente; não foi executado navegador com duas abas físicas.

**Direção:** persistir operações individualmente por chave ou usar coordenação/transação entre runtimes. Não depender de um Map em memória para a integridade do registro compartilhado.

## D05 — Exclusão de conta bloqueada por colisão

**Fonte:** `backend/supabase/migrations/20261016012212_credits_and_invites.sql:75`.

A exclusão reescreve `idempotency_key=id::text` antes de remover o vínculo do usuário. O ID de uma operação também é uma chave idempotente válida para outra operação da mesma conta. Uma ordem de atualização possível viola `UNIQUE(user_id,idempotency_key)` e desfaz toda a exclusão.

**Evidência:** PostgreSQL retorna SQLSTATE `23505`; a conta permanece. O erro depende do plano/ordem da atualização: ocorreu sem fixar o plano, mas não sempre. Com um plano de index scan legítimo fixado no harness, repetiu 3/3 vezes. Não é correto afirmar que toda exclusão falha.

**Direção:** fazer a pseudonimização sem introduzir conflitos intermediários de unicidade, preservando o ledger. Se a migration já foi aplicada em algum ambiente, preparar uma nova migration corretiva; não reescrever silenciosamente o histórico aplicado.

## D06 — Relógio da transação anterior à espera por lock

**Fontes:** `backend/src/modules/credits/credits.service.ts:174` e `backend/src/modules/credit-invites/credit-invites.service.ts:54`.

`now()` representa o início da transação. O valor não avança durante uma espera por lock, permitindo aprovar uma validade que já acabou quando o lock finalmente é obtido.

**Duas reproduções em PostgreSQL real:**

- Reserva com prazo de 250 ms; liquidação aguarda lock por 350 ms; resultado `succeeded`, prazo expirado e débito de 15 unidades.
- Convite com prazo de 250 ms; resgate aguarda lock por 350 ms; resultado expirado, `used`, concessão de 75 unidades.

Os prazos curtos aceleram o mesmo caminho dos serviços reais. Os cenários repetiram 3/3 vezes. Não houve alteração de prazo ou dados reais de produção.

**Direção:** obter os locks e revalidar o prazo com horário atual antes da decisão final. Apenas trocar a função de relógio dentro de uma expressão avaliada antes da espera pode não resolver todos os casos; testar explicitamente a ordem entre lock e validação.

## D07 — Zero exibido enquanto o saldo está carregando

**Fontes:** `app/src/features/credits/components/CreditBalance.tsx:9` e `:22`; `app/src/features/credits/store.ts`.

Após o recurso ter sido reconhecido como ativo, uma falha pode deixar `wallet=null`. A próxima consulta limpa `error`, mas o componente ignora `loading` e usa `wallet?.available_units ?? 0`. Assim exibe **0 créditos disponíveis** sem conhecer o saldo.

**Impacto:** informação incorreta temporária, não um débito real. Corrigir com estado explícito de carregamento/indisponibilidade sem desfazer a regra de ocultar créditos quando o recurso está desligado.

## D08 — Estado terminal do convite mantém ação inválida

**Fonte:** `app/src/features/invites/screens/InviteScreen.tsx:90` e bloco de confirmação em `:143`.

Uma prévia válida continua guardada depois que `/redeem` devolve 410 `INVITE_UNAVAILABLE`. A mensagem pede outro convite, mas o botão **Confirmar e receber créditos** segue habilitado.

**Impacto:** repetição de requisições destinadas a falhar. O backend continua negando; não foi encontrado bypass de resgate. Invalidar a prévia ou manter estado terminal que bloqueie o claim, preservando retry para falhas transitórias.

## Risco adicional — nova chave após erro 500 ambíguo

**Fonte:** `app/src/shared/services/operation-requests.ts`, `isDefinitiveRejection()`.

A regra trata como definitivos erros 5xx com código que não esteja numa pequena lista de exceções, incluindo `INTERNAL_SERVER_ERROR`. No cliente, um primeiro retorno 500 com esse código seguido de retry produziu **duas chaves diferentes**.

Se o 500 ocorrer depois de uma liquidação confirmada no servidor, a nova chave pode representar outra operação cobrável. O teste simula esse retorno pós-commit no adapter: **não executa dois débitos reais nem prova um caminho de serialização defeituoso nos handlers atuais**. Portanto, este item é um risco condicional de recuperação, separado dos oito achados acima.

Recomendação: encerrar a chave por um estado terminal conhecido da operação, e não pela suposição de que qualquer código 500 do servidor significa rollback. Consultar a operação quando houver ambiguidade.

## Validação executada

| Verificação | Resultado |
|---|---|
| App, testes existentes | **93 suítes / 596 testes passaram** |
| Backend, testes existentes | **386 passaram; 24 opt-in ignorados** |
| TypeScript app e backend | Passou |
| Build web e build backend | Passaram |
| Gates de fontes Android e iOS | Passaram |
| Controles backend focados, incluindo PostgreSQL real | **39 passaram**, incluindo 17 testes de banco |
| Repros novos de operações/sessões | **9 testes intencionalmente vermelhos**, incluindo repetições para validar os seams reais |
| Repros novos de UI | **3 falhas esperadas / 11 controles passaram** |
| Repros novos backend | **3 cenários falharam como esperado**, agrupados em D05/D06 |

Os testes de diagnóstico têm asserções de comportamento correto e ficam intencionalmente vermelhos na base atual. Não são falhas de instalação do harness. Eles estão em `docs/qa/debug-2026-10-18`, fora das roots usuais da suíte, e podem virar regressões durante a correção.

Inicialmente as dependências locais estavam ausentes; `npm test` não encontrava Jest/Vitest. Foi executado `npm ci` nos dois projetos, sem alteração dos lockfiles, e então as validações acima passaram.

### Reproduzir

- **App/operações:** dentro de `app`, executar `./node_modules/.bin/jest --config ../docs/qa/debug-2026-10-18/app-operation-jest.config.cjs --runInBand --no-cache`.
- **UI:** comando completo e os três arquivos em [ui-layout-invites-report.md](./ui-layout-invites-report.md).
- **Backend:** instruções e guardas do banco descartável em [backend-credits-findings.md](./backend-credits-findings.md). O script recria schemas; não usar uma base existente. A instância temporária usada no diagnóstico já foi encerrada.
- **Detalhes de operações:** [app-operations-report.md](./app-operations-report.md).
- **Saídas:** [app-operation-output.txt](./app-operation-output.txt), [ui-repro-output.txt](./ui-repro-output.txt) e [backend-credits-output.txt](./backend-credits-output.txt).

## Dependências: alertas que exigem triagem

`npm audit --omit=dev --json` apontou **12 pacotes no backend** (1 crítico, 7 altos, 1 moderado, 3 baixos) e **64 no app** (1 crítico, 38 altos, 25 moderados). Os totais são de pacotes sinalizados, não de explorações comprovadas ou de vulnerabilidades independentes. Ferramentas declaradas/transitivas em `dependencies` também entram na árvore do app, mesmo sem executar dentro do binário nativo.

Exemplos instalados: `fast-jwt@6.2.4` no backend e `shell-quote@1.10.0` na árvore do app têm alertas classificados como críticos pelo registro. A exploração desses alertas no aplicativo **não foi validada**; condições de algoritmo, chave, cache e caminho de execução precisam de análise própria. Não interpretar isso como prova de bypass de autenticação em produção.

Snapshot sanitizado com títulos, intervalos e links dos advisories: [dependency-audit-summary.json](./dependency-audit-summary.json). Não foi executado `npm audit fix`, upgrade ou downgrade automático; mudanças nativas exigem avaliar compatibilidade e runtime OTA.

## Ordem recomendada

1. Corrigir D01 e D03: isolamento entre contas em efeitos assíncronos e no despacho HTTP.
2. Corrigir D02/D04 e tratar o risco de 500: resultado concluído deve permanecer recuperável pelo proprietário, inclusive após troca de sessão e em múltiplas abas.
3. Corrigir D05/D06 e repetir os repros PostgreSQL antes de ativar a carteira ou aplicar uma correção ao banco real.
4. Ajustar D07/D08 e transformar os cenários em regressões das suítes regulares.
5. Fazer triagem dos advisories e executar aceite visual/nativo.

## Limites

Não houve chamadas pagas de IA, acesso a dados reais, consulta das flags de produção, validação de grants/PostgREST no Supabase remoto, migração ou publicação. A implementação usa flags desligadas por default, mas o estado real de cada ambiente não foi certificado nesta investigação.

Não foram realizados testes físicos no iPhone 13/iPad, VoiceOver, teclado, gravação/interrupção de áudio ou captura visual. Os testes JS não comprovam que o corte original desapareceu. Este é um diagnóstico dos fluxos examinados, não uma certificação de ausência de falhas em todo o produto.
