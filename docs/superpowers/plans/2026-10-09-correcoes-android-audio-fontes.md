# Plano: ciclo de vida do áudio e fontes Android

Data: 2026-10-09 · Status: implementação executada em 2026-10-10; validação em aparelho e publicação pendentes

**Spec:** [Correções Android: áudio e fontes](../specs/2026-10-09-correcoes-android-audio-fontes.md).

**Objetivo:** corrigir A1/A2 primeiro e F1 depois, com testes de regressão, validação do AAB e evidência de distribuição.

**Arquitetura:** manter `useVoiceMessage` como controlador da operação, o serviço de gravação como proprietário dos recursos nativos e os serviços Axios como transporte. Conectar foco/AppState e sessão ao cancelamento; acrescentar apenas o contexto necessário ao envio de voz no store existente. Usar identidade de operação e geração da sessão para rejeitar resultados obsoletos. Sem dependências novas.

## 1. Preparar a base e reproduzir

- [x] Consultar `origin/main`, instruções locais e estado dos worktrees. Criar worktree isolado a partir da main atual; o checkout original está em `feat/progresso-dieta` com alterações pendentes e não é a base da correção de áudio.
- [x] Ler a spec e os arquivos de voz, `CoachScreen`, `ChatInput`, auth/store, coach/store, `coach.service` e `api.ts`. Identificar os resets de sessão, o ciclo de refresh e o contrato real de cancelamento Axios instalado.
- [x] Rodar typecheck/testes como baseline. Registrar lint existente separadamente; confirmar os scripts disponíveis em `app/package.json`.
- [x] Recriar o teste A1 em `useVoiceMessage.test.ts`: transcrição controlada → stop → unmount → resolução tardia → `onSend` deve continuar sem chamadas. Confirmar que falha antes da correção.
- [x] Reproduzir A2 com navegação real de abas no harness RNTL: manter Coach montado, trocar foco e avançar o relógio além de 60 s. Verificar cancelamento e ausência de transcrição/envio, sem transformar troca de aba em unmount artificial.

**Concluído quando:** base/commit estão registrados e ambos os cenários falham pelo comportamento incorreto esperado.

## 2. Invalidar operações e cancelar transporte

**Arquivos principais:** `app/src/features/coach/hooks/useVoiceMessage.ts`, `app/src/shared/services/coach.service.ts`, seus testes; auth/store e coach/store somente onde necessário ao isolamento da voz.

- [x] Criar controle local de identidade/validade de operação e cancelamento. Capturar a geração de sessão; invalidar sincronamente em logout/perda de autenticação/troca de usuário, sem invalidar refresh legítimo. Se auth/store precisar de um contador de sessão, mantê-lo transitório e cobrir logout/login na mesma conta.
- [x] Propagar `AbortSignal` opcional para `coachService.transcribe`, preservando payload e timeout. Testar o config recebido pelo Axios e tratar cancelamento silenciosamente.
- [x] Validar a operação após cada await, antes de iniciar transcrição e antes do envio. Liberar gravador adquirido tardiamente. Conclusão/erro antigo não altera uma operação nova.
- [x] Acrescentar contexto opcional de voz ao caminho `onSend`/`sendMessage`/`coachService.sendMessage`, conforme os tipos existentes: sessão/operação válida e sinal de cancelamento. Preservar contratos de texto. Cancelar o request em logout e impedir efeitos tardios em messages/conversationId/isLoading/error e criação de diet job.
- [x] Cobrir cancelamento durante permissão, preparação, parada/leitura, transcrição e envio ao chat; rejeição tardia; logout/login na mesma conta; troca de conta; refresh; nova operação após invalidação.
- [x] Confirmar que a verificação de sessão e o sinal também impedem despacho tardio com token da nova conta, considerando o interceptor assíncrono de `api.ts`; restringir a mudança ao contexto de voz.

**Concluído quando:** A1 passa, os testes de isolamento passam e chamadas de texto conservam o comportamento anterior.

## 3. Conectar foco, background e limpeza nativa

**Arquivos principais:** `useVoiceMessage.ts`, `CoachScreen.tsx`, `ChatInput.tsx`, `voice-recorder.service.ts` e testes relacionados. Escolher um único ponto de integração de foco; preservar a montagem normal das abas.

- [x] Usar as APIs de foco do React Navigation já instalado e `AppState` do React Native para invalidar operações ao sair da tela/background, removendo listeners no cleanup.
- [x] Aplicar a política da spec ao diálogo de permissão do SO, distinguindo a espera de permissão de gravação/transcrição ativa. Resolver permissão com tela oculta/app em background encerra a tentativa.
- [x] Serializar finalização/limpeza do gravador. Stop, cancelamento e timer devem compartilhar um único encerramento; nova gravação só é permitida após liberar o recurso anterior/restaurar modo de áudio.
- [x] Atualizar o estado/controle do `ChatInput` se houver fase de limpeza. Tratar falha de liberação explicitamente, com recuperação controlada e teste, evitando sobreposição de gravadores.
- [x] Cobrir timer vs stop, cancel vs stop, cancelamento lento seguido de novo start, retorno rápido à aba, background e resultado tardio. Confirmar ausência de alerts/envios em operações invalidadas.
- [x] Rodar o harness de abas criado na etapa 1; manter todos os casos atuais de 1 s/60 s, permissões/erros e envio por texto.

**Concluído quando:** A2 passa sem desmontar a aba, há uma única finalização/envio no caso válido e os testes de concorrência passam.

## 4. Validar e preparar a entrega de áudio

- [x] Rodar `npm run type-check`, `npm test -- --runInBand`, `npm run build:web` e lint dos arquivos alterados, dentro de `app/`. Registrar o lint global como dívida separada e corrigir erros introduzidos pelo diff.
- [x] Rodar o bundle Android de release com o mesmo comando/entrada do CI vigente; configuração de API deve vir do ambiente apropriado sem exibir secrets.
- [ ] Executar smoke em Android release com módulos de áudio: gravação normal; negar microfone; trocar aba; scanner; background/bloquear tela; sair da conta durante transcrição; login na mesma/outra conta; texto após cancelamento. Conferir indicador de microfone do SO e logcat. Registrar modelo/API, build/runtime, resultado por caso e capturas necessárias. Verificar regressão de voz no iOS disponível; marcar explicitamente cobertura ausente.
- [x] Revisar staged diff com caminhos explícitos e `git diff --cached --check`. Preparar PR do áudio sem assets nativos, dependências ou permissões novas.
- [ ] Quando a publicação for autorizada, conferir CI do commit e runtime Android do OTA contra o build que possui áudio. Verificar o update em aparelho após reabertura e repetir cenários críticos.

**Concluído quando:** gates e smoke têm evidência; PR está revisável. Publicação só é concluída com commit/runtime correspondentes e casos críticos verificados. Este documento não autoriza merge ou publicação.

## 5. Sincronizar fontes Android e criar o gate

**Arquivos principais:** os cinco `.ttf` em `app/android/app/src/main/assets/fonts/`, `app/android/link-assets-manifest.json`; um script pequeno em `app/scripts/` a criar; `app/package.json` e `.github/workflows/ci.yml` para o gate. As fontes válidas em `app/assets/fonts/` são a origem existente.

- [ ] Criar verificação de arquivos de fonte e igualdade de bytes/hash origem → Android, usando Node e validação de fonte suficiente para identificar os TTF esperados. Confirmar falha com as cópias HTML atuais.
- [ ] Verificar a interface da ferramenta `react-native-asset` instalada para atualização apenas Android. Se não houver opção segura, copiar explicitamente os cinco arquivos e atualizar o manifest no formato existente. Conferir a licença e os nomes das famílias.
- [ ] Executar a verificação novamente; validar os metadados/fontes com ferramenta disponível e conferir que o diff contém apenas assets/manifest/gate esperados. Preservar iOS e fontes web.
- [ ] Integrar o script ao CI como passo bloqueante antes de bundling/build. Evitar gate que apenas lê as fontes de origem ou aceita HTML por ter extensão `.ttf`.
- [ ] Criar PR separado depois do áudio, com os gates da etapa 4 e o gate de fontes aprovados. Mudança nativa e runtime devem aparecer na descrição.

**Concluído quando:** as cinco cópias correspondem às fontes válidas, a verificação falha no estado antigo e passa no novo, e o CI passa a detectar essa divergência.

## 6. Verificar artefato e distribuição Android

- [ ] Sob autorização de release, gerar build EAS production da revisão com fontes corrigidas. Usar o versionCode remoto disponível; registrar commit/build/runtime e verificar compatibilidade com o OTA correspondente. Preservar a estratégia de fingerprint existente.
- [ ] Baixar o AAB gerado e inspecionar as cinco entradas `base/assets/fonts/`: fonte válida, igualdade de bytes com a origem e ausência de HTML. Conferir alinhamento dos segmentos LOAD das bibliotecas ELF de 64 bits para 16 KB e mapping do R8 no artefato.
- [ ] Fazer smoke em APK de release derivado desse AAB ou distribuição interna do mesmo artefato, em Android 15/16: cadastro/login, Dashboard, diário/refeições, scanner, mentor texto/voz, logout; conferir fontes, teclado e barras do sistema. Registrar origem do APK e vínculo com o AAB.
- [ ] Na etapa autorizada de loja, verificar track, versionCode, status de aprovação e rollout na Play Console. Build EAS concluído ou OTA publicado, isoladamente, não encerram esta etapa.
- [x] Preparar recuperação: áudio via update compatível anterior; fontes via novo build com versionCode maior e verificação de runtime. Distinguir rollback de JS de reversão de assets nativos, que OTA não desfaz.

**Concluído quando:** artefato contém as fontes corretas, smoke está aprovado e a versão/track da Play têm evidência. Se aparelho/console estiver indisponível, registrar exatamente a validação pendente.

## Registro de execução

Ao executar cada etapa, atualizar os checkboxes e registrar commit, comandos/resultados, arquivos alterados e bloqueios reais. Guardar evidência de casos críticos junto ao PR ou em documento versionado de validação; logs locais de `/tmp` são auxiliares. A entrega final deve distinguir implementação, validação em aparelho, publicação OTA e distribuição pela loja.

### Execução de 2026-10-10

- Base: `origin/main` em `728ad40c0383626eb6eefa9b82638ce0217c1324`.
- Worktree isolado: `orca/workspaces/calorIA-Frontend/android-audio-fontes`; checkout original preservado.
- A1/A2 reproduzidos antes da correção, incluindo troca real de abas sem desmontar Coach. Fontes antigas reprovaram o gate por conter HTML.
- Implementados invalidação por operação/sessão/foco/AppState, AbortSignal até o envio ao chat, serialização e falha explícita de cleanup. Refresh antigo também foi corrigido após teste reproduzir a perda da nova sessão.
- Revisão encontrou captura tardia durante preparação nativa; guard dentro do serviço e teste controlado corrigiram o problema antes da entrega.
- Os registros de validação e os limites estão em [validação de áudio](../../android-audio-validacao-2026-10-10.md); fontes são entregues em uma revisão separada.
- Não há aparelho conectado nem AVD configurado. Smoke nativo Android/iOS, EAS assinado, OTA e Play Console continuam pendentes. Este estado não significa correção distribuída em produção.
