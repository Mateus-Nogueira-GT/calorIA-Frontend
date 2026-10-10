# Correções Android: ciclo de vida do áudio e fontes Inter

Data: 2026-10-09 · Status: especificação para implementação

## Objetivo e evidência

Corrigir os três achados da revisão de `728ad40c0383626eb6eefa9b82638ce0217c1324` (PRs #56–#60), preservando o chat por texto, a navegação e a geração de dieta.

| ID | Prioridade | Problema | Evidência |
| --- | --- | --- | --- |
| A1 | P1 | Transcrição concluída após desmontagem ainda chama o envio | Teste com promise controlada: `onSend` chamado uma vez depois de `unmount` |
| A2 | P2 | Trocar de aba mantém gravação ativa, com possível envio automático oculto | Cleanup de `useVoiceMessage` só trata desmontagem; Coach permanece montado nas abas |
| F1 | P2 | Fontes Android empacotadas continuam sendo HTML | As cinco entradas `base/assets/fonts/Inter-*.ttf` do AAB 27 são HTML |

A2 foi identificado pelo fluxo de código; sua reprodução nativa ainda está pendente. Envio de conteúdo para uma conta posterior é um risco decorrente de A1 e do interceptor que lê o token atual; a revisão reproduziu o callback tardio, sem executar troca de conta em produção.

Referências verificadas na revisão:

- [Build Android 27](https://expo.dev/accounts/mateusnogueiras-team/projects/caloria/builds/6aab0f60-3d0f-4347-8d99-801eb4e7180c): concluído no EAS, commit `728ad40`.
- [OTA Android](https://expo.dev/accounts/mateusnogueiras-team/projects/caloria/updates/f0f4f3f8-6833-4cd5-9834-8a9206201a7c): runtime `0457893087a8537c05f9545b55dd20050aed780b`, igual ao build 27.
- [CI](https://github.com/Mateus-Nogueira-GT/calorIA-Frontend/actions/runs/37400652034): testes existentes e typecheck passaram. A revisão local confirmou 453 testes; lint tinha 39 erros/49 avisos.

Esses registros comprovam build e OTA, sem confirmar a liberação do versionCode 27 na Play Store. O teste temporário e o relatório da revisão estão em `/tmp/caloria-android-review-20261009`; sua disponibilidade não é requisito para implementar: os cenários abaixo permitem recriar a evidência.

## A1/A2 — Contrato de operação de voz

Uma operação pertence a uma sessão autenticada e a uma instância ativa da tela. Ela só pode avançar se continuar válida, com o Coach em foco e o aplicativo ativo.

### Identidade e invalidação

- Capturar uma identidade de operação e a geração da sessão ao iniciar. Logout, perda de autenticação e troca de usuário invalidam imediatamente a operação, inclusive logout seguido de login na mesma conta.
- Refresh do access token na mesma sessão mantém a operação válida. Comparar apenas tokens ou apenas `user.id` não atende ao contrato.
- Invalidar também ao desmontar, perder foco, cancelar e entrar em background durante gravação/transcrição. Voltar à tela ou à conta anterior não revalida uma operação antiga.
- Validar a operação depois de cada espera assíncrona: permissão, preparação do gravador, parada/leitura, transcrição e antes de enviar ao coach. Resultados e erros obsoletos não geram envio, alerta ou atualização do estado atual.
- Ao aguardar permissão, nunca iniciar o gravador se a operação já perdeu validade. Uma transição transitória de `inactive` causada pelo diálogo do SO não deve inutilizar o fluxo de permissão; preparar/gravar apenas com a tela em foco e o app ativo. Se não estiver ativo ao resolver a permissão, encerrar essa tentativa sem início automático ao retornar.

### Cancelamento e concorrência

- Perda de foco/background interrompe e descarta a gravação, libera recursos e cancela o timer. Nenhum envio automático deve ocorrer com a tela oculta.
- Cancelar uma transcrição em voo usando `AbortSignal` no serviço Axios existente. Também ignorar sua conclusão tardia: cancelar HTTP sozinho não substitui a validação da operação.
- Uma transcrição já recebida pelo backend pode continuar sendo processada/cobrada; cancelamento local não promete rollback do provedor nem dos dados já recebidos.
- Limpeza é idempotente. Stop, cancelamento e timer concorrentes finalizam o gravador uma única vez; não iniciam dois pedidos nem dois envios.
- A limpeza nativa antiga deve terminar antes de permitir nova gravação. Isso impede que `restoreAudioMode` da operação anterior desative o gravador seguinte.
- Respostas de uma operação antiga não alteram `status`, timer ou referências de uma operação nova. Durante limpeza, o controle permanece indisponível; falha de limpeza não fica silenciosamente tratada como sucesso. Se for necessário um estado `cancelling`, refletir esse estado no `ChatInput` e nos testes.

### Limite com o envio do chat

Antes do envio, confirmar novamente sessão/operação. O envio originado por voz deve permitir cancelamento e impedir aplicação de resposta antiga no store após logout/troca de sessão, inclusive durante a etapa `/chat/message`. Usar um contexto opcional para voz no contrato existente, preservando chamadas de texto.

Uma mensagem já aceita pelo backend antes da invalidação pode permanecer no histórico da conta de origem; a correção não promete desfazer esse envio. Após a invalidação, nenhuma continuação local inicia novo envio, escreve conteúdo na sessão seguinte ou inicia geração de dieta a partir de uma resposta obsoleta.

### Comportamento preservado

Manter microfone com campo vazio, gravação MPEG-4/AAC, descarte abaixo de 1 s, envio automático aos 60 s enquanto a tela está ativa, mensagens de erro existentes e chat por texto. Cancelamento por navegação/sessão é silencioso. Web continua sem microfone. O hook compartilhado deve preservar o funcionamento no iOS.

## F1 — Contrato das fontes Android

- `app/assets/fonts/` é a origem das cinco fontes Inter válidas. Atualizar as cópias em `app/android/app/src/main/assets/fonts/`, preservando nomes, famílias e licença OFL.
- Inspecionar a ferramenta `react-native-asset` instalada e limitar a execução ao Android, ou copiar explicitamente os cinco arquivos e atualizar o manifest de assets conforme seu formato existente. Revisar todos os arquivos gerados; este escopo não altera o projeto iOS.
- Cada cópia Android deve ter os mesmos bytes da origem e ser reconhecida como fonte, não HTML. O AAB final deve conter esses mesmos arquivos válidos em `base/assets/fonts/`.
- Incluir uma verificação pequena e reproduzível de validade/sincronização das fontes no gate do app. Ela deve falhar com o estado anterior e detectar HTML ou divergência entre origem e cópia. Evitar uma infraestrutura genérica de assets.
- A mudança dos assets nativos exige novo build Android e verificação do runtime. Não excluir fontes do fingerprint para forçar compatibilidade OTA.

## Matriz de aceite

| Cenário | Resultado esperado | Evidência mínima |
| --- | --- | --- |
| Transcrição resolve após desmontar | Zero envios/alertas/alterações tardias | Teste com promise controlada |
| Logout e login em outra ou na mesma conta durante transcrição | Conteúdo antigo não chega à sessão nova | Teste com auth/store reais e serviços mockados |
| Refresh de token sem encerrar sessão | Voz conclui normalmente uma vez | Teste de regressão |
| Logout enquanto resposta de `/chat/message` está pendente | Resposta não altera sessão nova nem inicia job | Teste do store com contexto de voz |
| Trocar Coach → Hoje/Perfil, abrir scanner, background ou bloquear tela gravando | Gravador finalizado, timer cancelado, zero transcrições/envios | Integração com navegação montada + Android release |
| Navegar/logout durante permissão ou preparação nativa | Nenhum gravador órfão; recurso tardio liberado | Promises controladas |
| Cancelar durante parada/leitura ou transcrição | Nenhum envio tardio; resultado ignorado | Teste de corrida |
| Cancelar e voltar/iniciar rapidamente; resposta antiga resolve depois | Uma operação válida; limpeza antiga não interfere na nova | Teste de concorrência |
| Timer de 60 s e toque de parar coincidem | Uma parada, uma transcrição e um envio | Fake timers |
| Permissão negada, áudio curto e erro de rede/provedor | UX existente e possibilidade de tentar novamente | Testes existentes + smoke nativo |
| Cinco fontes na origem, cópias e AAB | Fontes válidas e bytes correspondentes | Script/gate + inspeção do AAB |
| Dashboard, cadastro e mentor em Android 15/16 | Inter renderiza; teclado/barras não encobrem controles | Smoke de release com captura/logcat |

## Entrega e limites

Entregar o áudio primeiro em alteração só de JS/TS, com OTA para o runtime compatível dos builds que já contêm os módulos de áudio. Em seguida entregar os assets Android, build EAS novo e publicação na loja em etapa própria. Registrar commit, runtime, versionCode e artefato de cada entrega; usar o versionCode remoto disponível no momento da execução, sem fixar o próximo número nesta spec.

Conclusão da implementação exige testes e gates aprovados. Conclusão da validação Android exige smoke no artefato de release e evidência do track/versionCode na Play Console. Ausência de aparelho/acesso deve ser registrada como pendência, sem declarar produção totalmente validada.

Fora de escopo: TTS, gravação no web, troca do provedor/modelo de transcrição, backend/migrations, redesign, limpeza global de lint e a corrida preexistente de refresh da dieta. Preservar timeouts, quotas, payloads e permissões existentes.
