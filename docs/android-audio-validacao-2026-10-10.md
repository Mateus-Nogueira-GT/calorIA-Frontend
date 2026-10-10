# Correção de áudio Android — validação

Data: 2026-10-10. Base: `728ad40c0383626eb6eefa9b82638ce0217c1324`.

## Comportamento entregue

A operação de voz é invalidada ao cancelar, desmontar, perder foco, entrar em background ou mudar a sessão. Logout e novo login na mesma conta também invalidam; refresh legítimo mantém a operação. Transcrição e envio ao chat recebem cancelamento HTTP. Resultados antigos não atualizam mensagens/conversa/erro/loading nem criam jobs de dieta.

Preparação, parada e cancelamento compartilham controle de recursos: nova tentativa aguarda limpeza, stop/cancel concorrentes finalizam uma vez e o serviço verifica validade após preparação antes de iniciar captura. A exceção de AppState inactive só vale enquanto aguarda o diálogo de permissão. Falha de liberação bloqueia o microfone e orienta fechar/reabrir o aplicativo.

O interceptor de refresh recebeu a proteção necessária para não restaurar credenciais de uma sessão encerrada nem repetir requests com a conta seguinte. Envio por texto mantém seu contrato anterior.

## Evidência automatizada

- Regressão A1: transcrição controlada após unmount enviava anteriormente; agora não envia.
- Regressão A2: harness React Navigation de abas conserva Coach montado, perde foco e avança além de 60 s; cancela sem transcrever/enviar.
- Preparação nativa controlada: invalidar antes de resolver prepare não chama record e libera o recurso. Teste falhou antes do guard.
- Sessão: logout/login mesma conta, troca de conta, refresh válido e refresh antigo resolvido após nova sessão.
- Transporte/store: abort durante transcrição e chat, erro/resposta tardios, request enfileirado com token antigo e ausência de job de dieta obsoleto.
- Concorrência: timer/stop, stop/cancel, limpeza lenta, falha de liberação e nova tentativa.

Comandos executados dentro de `app/`:

```sh
npm run type-check
npm test -- --runInBand
npm run build:web
npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output /tmp/caloria-fix.jsbundle --assets-dest /tmp/caloria-fix-bundle-assets
```

ESLint dos arquivos alterados: zero erros, 19 warnings. Lint global da base tem dívida anterior (39 erros/49 warnings); não foi ampliado o escopo para corrigi-la. Sem dependências novas, migrations ou alterações de permissões nativas.

Revisão de Standards e Correção realizada; o achado de preparação tardia foi resolvido e revisado novamente. Resultado final: 78 suites / 478 testes aprovados; typecheck e webpack web aprovados. Bundle Android de release aprovado. Logs locais auxiliares: `/tmp/caloria-fix-tests-final.log`, `/tmp/caloria-fix-types-final.log`, `/tmp/caloria-fix-web.log` e `/tmp/caloria-fix-bundle.log`.

## Limites e entrega

Não há Android conectado nem AVD configurado neste ambiente; não foi executado smoke em aparelho. iOS real também não foi validado. Faltam diálogo de permissão, indicador de microfone, scanner, bloqueio/background e jornadas autenticadas no release nativo.

PR de áudio deve ser entregue separadamente dos assets nativos. Antes de OTA, confirmar fingerprint/runtime do commit e do build com áudio instalado, CI e smoke. Nenhum OTA, merge ou publicação de loja foi executado.

Recuperação de JS: selecionar update anterior compatível com o runtime afetado e verificar em aparelho. O runtime anterior sem áudio não recebe automaticamente uma correção de runtime posterior. Cancelamento do cliente impede os efeitos locais tardios, mas não garante desfazer processamento que o servidor já iniciou.
