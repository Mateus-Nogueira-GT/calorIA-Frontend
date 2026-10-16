# Créditos e convites — preparação e operação

Implementação local de 15/10/2026. Nenhuma migration remota, publicação OTA ou cobrança foi ativada por este trabalho.

## Política preparada

Uma unidade contábil = 0,2 crédito. Foto concluída = 15 unidades (3 créditos); turno normal do coach = 2 unidades (0,4 crédito, duas mensagens). Convite = 75 unidades (15 créditos), uso único, sete dias, boas-vindas uma vez por conta. Conta existente sem boas-vindas é elegível. Não há concessão automática para toda a base nem compra de créditos nesta entrega.

A geração de dieta, áudio e scanner sem conta ainda precisam de política comercial. Com enforcement desligado, o comportamento dessas funções é preservado. Com enforcement ligado, essas funções retornam `503 CREDIT_POLICY_UNAVAILABLE`; a ferramenta de geração também fica indisponível no coach. **Não ligar enforcement global antes de decidir e implementar essas tarifas e a migração dos usuários atuais.**

`CREDITS_ENFORCEMENT_ENABLED=false` e `CREDIT_INVITES_ENABLED=false` são os defaults. Ativar convites não ativa cobrança. A URL pública deve ser um domínio controlado, HTTPS, terminando em `/convite`; default configurado: `https://calor-ia-frontend.vercel.app/convite`.

## Validação local

- Backend: `cd backend && npm test && npm run typecheck && npm run build`.
- Banco real: usar PostgreSQL descartável local, nome contendo `credits_test`. Executar `TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/caloria_credits_test npx vitest run src/modules/credits/credits.integration.test.ts` dentro de backend. O harness **recria schemas public/auth** desse banco de teste; rejeita host externo. Nunca apontar para base existente.
- CI novo: `.github/workflows/credits-db.yml` cria PostgreSQL 16 efêmero sem credenciais de produção.
- App: Jest, TypeScript, ESLint dos arquivos alterados, build web, bundle Android e gates de fontes existentes.
- Testes PostgreSQL cobrem saldo/reserva, corrida, idempotência, commit confirmado remotamente com resposta perdida, persistência rollback, fencing, permissão admin, ledger imutável, boas-vindas e exclusão com auditoria preservada.

## Resultado consolidado desta execução

- App: 91 suítes, **585 testes passaram**; TypeScript e build web passaram.
- Backend: **386 testes passaram**; 24 opt-in ignorados nessa chamada (17 de PostgreSQL executados separadamente + 7 de avaliação paga). Typecheck e build passaram.
- PostgreSQL real local: **17 testes passaram**, incluindo cancelamento antes da reserva, resposta tardia e tentativa já liquidada. HTTP/política e CORS verificados também em testes próprios.
- Bundle Android release passou; Metro emite aviso herdado sobre config. Gates das cinco fontes Android e das fontes iOS passaram.
- ESLint dos arquivos app alterados: zero erros; avisos de estilo/harness registrados, sem bloqueio. Biome dos arquivos backend alterados passou.
- Fingerprints preservados: iOS `0aee9a097c7650b889b243718ef0bc7b92b57300`; Android `9a9173edf9fb0664f7f177227c1728169caaeb0b`. Isso permite reutilizar os runtimes compatíveis; não comprova publicação nem instalação.
- Não houve canário pago, teste em produção, migração remota ou publicação OTA. O estudo de custo local anterior foi preservado fora dos commits.
- Captura interativa indisponível: IAB e Chrome não estavam disponíveis no CUA; skill `playwright-interactive` ausente. Não foi certificada validação visual desktop/mobile. Sem Xcode Simulator/aparelho conectado, o aceite nativo permanece pendente.

## Antes de disponibilizar

1. Validar grants reais, funções e permissões no Supabase de homologação. A fixture local não prova configuração PostgREST ou roles de produção. Inventariar clientes que escrevam `profiles` diretamente antes do REVOKE; o app deste repositório escreve via backend.
2. Revisar/aplicar a migration nova pelo fluxo de entrega apropriado. Não modificar migrations históricas. Merge não aplica SQL.
3. Publicar backend inicialmente com flags false. Depois publicar app/web compatíveis; clientes antigos sem `Idempotency-Key` não podem usar IA cobrada.
4. Validar manualmente o iPhone 13, iPad, Android e web conforme README de QA. Falta ambiente iOS neste workspace; testes JS não substituem esse aceite.
5. Habilitar convites somente em ambiente/piloto controlado. Admin gera link, conta abre, entra/cadastra e confirma a conta; saldo15 uma vez. Link aberto ou pré-visualizado não concede saldo.
6. Depois de fechar as tarifas e política dos legados, validar foto15→12 e turno12→11,6; desligamento/recuperação; segundo aparelho; saldo insuficiente sem inferência.

## Operação

- **Link perdido:** apenas hash é guardado no servidor. Repetir emissão com mesma chave retorna o ID e `url:null`; revogar esse convite ativo e gerar outro. Não é possível recuperar o token original na listagem.
- **Compartilhamento:** manual pelo administrador; o sistema não manda email/WhatsApp. No navegador há copiar; no nativo, folha de compartilhamento e texto selecionável.
- **Sem app:** concluir resgate web por email/senha e entrar na mesma conta no app. Alternativa: voltar ao convite após instalar. Instalação pela loja não transporta token automaticamente. Universal Links não fazem parte desta entrega.
- **Operação pendente:** Perfil → Meus créditos → Recuperar solicitação. O app persiste chave/metadados, sem foto ou texto da mensagem nesse registro. Retry da mesma tentativa não chama IA nem debita novamente após conclusão. Tentativa definitivamente falha pode ser encerrada e reenviada com nova chave.
- **Cancelamento:** scanner tem ação explícita; foto/voz cancelam por requisição independente autenticada. Tombstone de conta/chave impede uma solicitação original atrasada de começar; reserva em execução é liberada com fencing. Se a operação já liquidou, o resultado continua recuperável e não há estorno automático. Falha de rede no cancelamento exige conferir o estado em Créditos, sem promessa antecipada de liberação.
- **Reservas:** lease de cinco minutos; reconciliação nas requisições de saldo/operação/novas operações invalida o fence antes de liberar saldo. Uma resposta antiga não pode liquidar depois. Ainda não há cron de reconciliação ou alerta; para operação contínua é necessário provisionar monitoramento da idade das reservas. Não há loop de inferência automática de operações abandonadas.
- **Falha contábil:** 503, sem permitir inferência sem reserva. Saldo insuficiente:402; conflito/em processamento:409. Não confundir indisponível com saldo zero.
- **Rollback:** manter ledger/migration. Desligar enforcement só por decisão operacional explícita: o app volta ao uso anterior sem débito. Operações pendentes deixam de ser consultáveis enquanto enforcement estiver desligado; reavaliar/reconciliar antes de reativar. Flags não apagam dados nem concedem saldo.
- **Exclusão de conta:** remove conteúdo das operações e pseudonimiza vínculos; ledger mínimo permanece. Trigger privado sem EXECUTE público. Não habilitar escrita de ledger por cliente para ajustes manuais.

## Limites de aceite

Nenhuma compra/IAP, tarifa monetária, associação HTTPS nativa, proteção de múltiplas contas por pessoa, ou validação de entregabilidade por email foi criada. Convites são bearer links, com posse e confirmação autenticada explícitas. Testes locais não comprovam produção, instalação OTA, VoiceOver, teclado nativo ou aplicação da migration remota.
