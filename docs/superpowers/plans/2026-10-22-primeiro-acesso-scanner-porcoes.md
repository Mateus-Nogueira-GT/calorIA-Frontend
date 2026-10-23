# Plano — primeiro acesso e scanner por porção

Spec: ../specs/2026-10-22-primeiro-acesso-scanner-porcoes.md
Branch: fix/primeiro-acesso-scanner-porcoes (base origin/main 06a7854).

## Execução em ciclos

1. [x] Criar testes que falhem para App com OTA pendente, scanner com vários itens/pesos e campo de peso ausente na UI. Rodar e registrar sintomas.
2. [x] Bloquear a montagem inicial da navegação por uma espera limitada de OTA. Manter Text e validar altura no dashboard inicial. Cobrir offline, timeout e desmontagem.
3. [x] Atualizar contrato/prompt versionável do Vision para itens/peso; validar a resposta e versionar cache. Cobrir PF, panela, erros e guardrails.
4. [x] Mostrar e editar peso com escala proporcional e validação. Exibir orientação sobre a quantidade inteira fotografada e preservar respostas legadas.
5. [x] Enviar peso na confirmação e gravar quantity_g já existente. Preservar peso em edição sem campo. Testar dados até a fronteira de escrita e falha parcial.
6. [x] Rodar suítes relevantes, typechecks, lint focado, build backend e bundles JS de release Android/iOS. Revisar diff e limites de prova; atualizar este ledger.

## Registro

- 22/10: diagnóstico inicial registrado na spec; worktree isolada, alterações locais anteriores preservadas.
- Pendências externas: versão/build do iPhone, instalação limpa + cadastro em aparelho, fotos originais PF/panela e validação humana da estimativa. Não bloqueiam os testes e correções do contrato.

- Implementação concluída e validada em ciclos red/green. Relatório: ../../qa/primeiro-acesso-scanner-2026-10-22/validacao.md.
- Resultado: app 720 testes, backend 433 testes, PostgreSQL real local 2 testes; typechecks, build backend e bundles JS Android/iOS passaram.
- Aceite em hardware permanece aberto, em especial o corte no primeiro cadastro. A hipótese do bundle antigo não foi promovida a causa confirmada do aparelho sem versão/build e reprodução física.
