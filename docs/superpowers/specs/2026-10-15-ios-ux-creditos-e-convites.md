# iOS sem cortes, créditos de uso e convites pelo admin

Data: 15/10/2026. Base inspecionada: main `2bbf30c`.
Status: **implementação local preparada, sem ativação remota**. O pedido “execute” iniciou as propostas abaixo com flags desligadas. Reprodução visual no iPhone 13, matriz comercial D3 e aceite de produção continuam pendentes; ver relatório no plano.
Plano: [2026-10-15-ios-ux-creditos-e-convites.md](../plans/2026-10-15-ios-ux-creditos-e-convites.md).

## 1. Pedido e ordem de entrega

1. **Primeiro:** reproduzir e corrigir o corte da tela inicial no iPhone 13 e revisar a UX iOS das jornadas principais.
2. Implementar carteira: **3 créditos por foto analisada**; **1 crédito para cada 5 mensagens de usuário e coach somadas**.
3. Criar no admin a aba **Convites e créditos**, que gera link individual de entrada com **15 créditos de boas-vindas**.
4. Entregar em fases revisáveis, preservando Android/web, navegação, conteúdo e permissões.

Não adicionar cobrança enquanto a correção iOS ainda impede o uso. O plano permite entregar a fase iOS independentemente das fases de carteira/admin.

## 2. O que foi encontrado — evidência e limites

| Superfície | Evidência no código atual | Implicação |
|---|---|---|
| Hoje | `DashboardScreen.tsx`: `paddingTop: 56` fixo, valor calórico de 48, cards lado a lado | Candidatos a verificar com notch, fonte ampliada, nomes/valores longos; causa do corte **não confirmada** |
| Diário / Perfil | Também usam topo fixo em `FoodLogScreen.tsx` / `ProfileScreen.tsx` | Tratar a raiz do padrão, sem trocar 56 por outro número mágico |
| Coach | Usa `useSafeAreaInsets`; input trata teclado | Padrão local útil, com atenção para não duplicar insets ou descontar tab bar duas vezes |
| Texto | `Text.tsx` já contém `autoLineHeight`; `Text.test.tsx` existe | Não repetir a correção antiga como se estivesse ausente; testar glifos, escala e estilos explícitos no iOS |
| Navegação | `BrandTabNavigator.tsx` registra 6 itens e usa inset inferior | Verificar rótulos e câmera no iPhone 13; não acrescentar Créditos/Admin à tab bar global |
| Admin | `require-admin.ts`, migration 015 e serviço/schemas existem; não há AdminScreen nem admin.routes conectado no server | A aba exige concluir o host mínimo do admin; não é só editar uma tela já existente |
| Permissão admin | Migration 001 permite UPDATE do próprio perfil; 015 acrescenta `is_admin`; sem restrição de coluna encontrada | Risco de escalada se os grants reais permitirem a escrita; **não foi explorado nem confirmado em produção** |
| Links | RootNavigator só declara `caloria://`; faltam associações HTTPS nativas | Não prometer Universal Links/deferred deep link já funcionando |
| Crédito | Sem carteira, ledger ou convites comerciais existentes | `ai_usage` é telemetria best-effort, não saldo nem autorização de gasto |
| Auth | Cadastro usa `admin.createUser` com `email_confirm: true` | Não tratar email digitado ou confirmado por esse fluxo como prova de posse para resgate automático |

### Limite da pré-auditoria

Este ambiente possui Command Line Tools, mas `xcrun simctl` não está disponível; não há simulador iOS conectado. O navegador integrado retornou indisponibilidade. Nenhuma captura do iPhone 13 foi obtida. Portanto, isto é **inspeção técnica preparatória**, não auditoria visual completa, nem confirmação de que os cortes foram reproduzidos/corrigidos. Cada fluxo abaixo precisa de captura e registro em aparelho antes do aceite.

## 3. iOS: requisitos e matriz de revisão

### R-IOS-01 — reprodução antes da correção

Registrar no iPhone 13: versão do iOS/app, build, runtime/update ID, orientação, tamanho de texto, Texto em Negrito e Zoom da Tela. Capturar a tela afetada antes de forçar OTA/reinstalar; comparar com o JS atual. Confirmar se “tela inicial” é Welcome, onboarding ou Hoje autenticado. Não atribuir o corte a safe area apenas por inspeção do fonte.

### R-IOS-02 — layout e tipografia

- Área segura superior/inferior calculada com as APIs já instaladas, sem duplo padding do navigator.
- Conteúdo rolável até o último CTA; home indicator e teclado não encobrem controles.
- Preservar `allowFontScaling`; corrigir reflow, limites de altura, `flexShrink`, mínimo de largura e line height antes de reduzir fontes. Não desativar Dynamic Type para esconder o bug.
- Calorias de 1 a 5 dígitos, metas longas, nome de 40 caracteres, percentuais >100%, macros e Fibras legíveis.
- No telefone, macros em 2×2 quando houver largura; empilhar quando fonte/largura exigirem. No iPad usar a largura disponível e testar Split View.
- Botões com alvo mínimo de 44 pt, rótulos acessíveis, contraste e ordem de foco verificáveis; sem nova biblioteca de UI ou troca de identidade visual.
- Barra inferior e scanner acessíveis em todas as escalas; preservar rotas. Alterar quantidade/organização de abas somente se a reprodução exigir e com regressão de navegação.

### R-IOS-03 — jornadas a capturar

| # | Jornada | Casos obrigatórios | Estado nesta spec |
|---|---|---|---|
| 1 | Welcome / login / cadastro / recuperação | CTA final, teclado, erros, scanner sem conta | Pendente de captura |
| 2 | Onboarding | Nome longo, opções, voltar, teclado, confirmação | Pendente de captura |
| 3 | Hoje | Corte relatado, calorias, metas, Fibras, vazio, loading, erro/retry | Relato do usuário; reprodução pendente |
| 4 | Scanner | Permissão negada, câmera/galeria, análise, editar, fibra, salvar, erro | Pendente de captura |
| 5 | Diário / plano | Seleção de data, edição preenchida, grupos de refeição, modais, totais | Pendente de captura |
| 6 | Coach / voz | Digitação, respostas longas, teclado, troca de aba, bloqueio, Central de Controle, chamada, silencioso | Pendente de captura |
| 7 | Perfil / evolução / social | Edição, listas, estados vazios/erro, logout e exclusão existentes | Pendente de captura |
| 8 | Créditos / convite / admin novos | Saldo zero, pendente, resgate, erro, formulário admin | Após implementação |

Aceite mínimo: iPhone 13 real com escala padrão e maior escala acessível; iPhone compacto em simulador quando disponível; iPad com tela cheia/Split View; regressão Android/web. Capturas web não substituem iOS nativo. Publicar relatório com screenshots antes/depois e saúde de cada passo; não declarar conformidade total de VoiceOver só por screenshots.

## 4. Créditos: unidade e regras do produto

### Regras confirmadas pelo usuário

| Evento | Créditos |
|---|---:|
| Foto/scan | 3 |
| 5 mensagens somadas de usuário e coach | 1 |
| Boas-vindas por convite admin | +15 |

### Proposta de representação — decisão D1 pendente

**Proposta recomendada:** cada mensagem faturável vale **0,2 crédito**. Uma troca completa usuário + coach vale **0,4 crédito**. Contagem é da conta e continua entre sessões/conversas; não reinicia ao criar conversa, reinstalar ou trocar aparelho.

Persistir inteiros: **1 crédito = 5 unidades**. Foto = 15 unidades; mensagem = 1; turno normal = 2; convite = 75. UI exibe créditos com vírgula decimal, sem floats na contabilidade. A pergunta sobre frações foi apresentada ao usuário; até confirmação, esta é a política proposta, não uma autorização para ativar cobrança. Se for escolhido bloco inteiro, definir cobrança antecipada/posterior, resto e tratamento do quinto item antes de implementar a integração.

Exemplos sob D1: saldo 15 → foto → 12; turno normal → 11,6. Cinco mensagens faturáveis somadas = 1 crédito. Como turnos normais têm duas mensagens, 3 turnos custam 1,2 — não fingir que 5 mensagens significam 5 perguntas + 5 respostas. Com 0,2 restante não iniciar turno normal que exige 0,4.

**Preço em reais não será implementado nesta fase.** R$ 6,50 foi uma unidade financeira da análise anterior; a política de consumo agora é de créditos de uso. A relação de venda/recarga precisa ser confirmada, sem criar preço de assinatura, checkout ou conversão automática no app. Exemplo de consumo: 6 fotos + 30 perguntas com 30 respostas/dia = 18 + 12 = **30 créditos de uso/dia**, 900/30 dias. Isso não é a estimativa financeira anterior de ~16 unidades de R$ 6,50.

### R-CR-01 — o que constitui consumo

- Foto: cobrar por **análise válida concluída e recuperável**; abrir câmera, cancelar, rejeição de formato, falha do provedor e imagem sem comida não debitam (política proposta de sucesso, D2).
- O débito ocorre na análise, independentemente de salvar no diário. Editar/salvar o resultado, registrar manualmente e ler histórico são gratuitos.
- Cache de imagem pode economizar provedor, mas não muda a tarifa de uma nova análise solicitada. Repetição técnica com a mesma chave idempotente nunca cria novo débito.
- Chat: cobrar as mensagens reais de uma operação concluída; normalmente 2 unidades. Não contar prompt de sistema, tools, marcadores de dieta, loading, onboarding local, erros de rede, retry interno ou texto repetido do histórico.
- Resposta de segurança bloqueada/falha não cobra o turno (D2). Uma sugestão enviada pelo usuário é uma mensagem normal; voz que vira texto usa a mesma contagem, sem contar arquivo de áudio novamente.
- **Geração de dieta e transcrição isolada não têm tarifa definida pelo pedido.** Não inventar zero, tarifa extra ou conversão por tokens. Matriz D3 precisa dizer se são incluídas na tarifa do chat ou cobradas separadamente antes de ativar todas as rotas de IA.
- Manter leitura de dados, perfil, histórico, diário e acesso a saldo mesmo com saldo zero. Não criar compra obrigatória ou link de pagamento externo.

### R-CR-02 — backend como autoridade

Checar autenticação, rate limit, cota técnica e saldo no servidor antes de inferência. Em saldo insuficiente retornar **402 `INSUFFICIENT_CREDITS`**, sem chamar o provedor, com saldo disponível e custo necessário. Falha de carteira é **503 `CREDITS_UNAVAILABLE`**, fail-closed; não copiar o fail-open da telemetria.

Reservar antes e liquidar uma vez depois do sucesso. Não manter transação/row lock durante a chamada de IA. Finalizar persistência do resultado/histórico + lançamento de crédito em uma transação quando estiverem no mesmo banco. Falha de persistência não pode cobrar e perder a resposta. Requisição interrompida no cliente não é prova de falha no servidor: operação fica consultável pela chave.

Cada envio leva `Idempotency-Key` gerada no app, persistida enquanto estiver pendente e reutilizada em retry/reabertura. Mesma conta + chave + payload retorna a mesma operação/resultado; mesma chave com payload diferente retorna 409. Cliente não fornece preço, saldo, grants, elegibilidade ou papel admin. Serializar envios concorrentes da mesma conversa para não sobrescrever o JSON de histórico; operações diferentes disputam o saldo atomicamente.

### R-CR-03 — carteira e estados propostos (novos)

| Tabela | Responsabilidade e invariantes |
|---|---|
| `credit_wallets` | Uma por usuário. `balance_units` liquidado, `reserved_units`, inteiros não negativos; `reserved_units <= balance_units`; disponível = diferença |
| `credit_operations` | user, tipo, chave, hash do payload, valor reservado, policy_version, lease e referência do resultado. UNIQUE(user, idempotency_key). Estados reserved/running/succeeded/failed/uncertain; transições monotônicas |
| `credit_ledger` | Grants e débitos imutáveis, signed units, operation/invite, motivo, actor e horário; UNIQUE(operation, entry_kind). Não confundir com `ai_usage` |
| `credit_invites` | hash do token, estado, expiração, grant 75 unidades, autor admin e usuário que resgatou; um resgate por link |

Não colocar tokens, fotos, áudio, prompts ou respostas completas no ledger. Referenciar resultados na operação e proteger seu acesso por proprietário. Indexar ledger/operações por user + created_at, token_hash único e pendências por estado/lease. RLS/revokes impedem leitura de terceiros e qualquer escrita direta de clientes. Apenas backend confiável concede/consome, sem função pública de “adicionar saldo”. Política de exclusão de conta deve preservar auditoria mínima sem identificação desnecessária; não usar CASCADE que apague silenciosamente movimentação de créditos.

Timeout ambíguo vai para `uncertain`, não reenvia inferência automaticamente nem libera duas vezes. Reconciliação auditada usa resultado persistido e estado da operação; reserva pode ser liberada somente após comprovar que não há execução ativa/resultados pendentes. Definir deadline por tipo, fencing da tentativa e reconciliação monitorada: ao encerrar uma tentativa não liquidada, invalidar atomicamente qualquer liquidação tardia antes de liberar saldo. Não executar inferência novamente nesse processo; custo tardio sem resultado entregue fica com a operação, não com o usuário. Não deixar crédito preso indefinidamente nem aplicar expiração cega enquanto o worker ainda pode liquidar.

## 5. Convites e admin

### R-INV-01 — admin mínimo e seguro

Entrada **Admin** no Perfil somente quando a API informa permissão; não adicionar tab global. Criar host AdminScreen com aba **Convites e créditos**, reutilizando guard/serviço existentes. Não promover ninguém a admin por endpoint. Expor `is_admin` somente na resposta autorizada do próprio perfil, nunca no schema de alteração.

**Gate de segurança:** conferir grants reais de tabela/coluna, policies e funções que escrevem profiles. UPDATE por proprietário não protege coluna privilegiada. Tornar `is_admin` imutável para anon/authenticated; preferir bloquear escrita direta de profiles quando os fluxos usam só backend, após inventariar consumidores. REVOKE apenas de coluna não basta se existir GRANT UPDATE da tabela. Testar também INSERT com `is_admin=true`. Sem passar esse gate, não publicar emissão de crédito/convites.

Toda rota admin autentica e aplica `registerAdminGuard` por request (404 para usuário comum, conforme padrão). Na falha do guard, negar. Erros/requests adulterados não concedem créditos.

### R-INV-02 — emissão e resgate

- Um link individual, **uma utilização**, grant fixo **15 créditos**, expiração proposta de 7 dias, revogável antes do uso (D4).
- Admin fornece identificação interna opcional do destinatário; não implementar envio de WhatsApp/email automático. Ações: gerar, copiar, compartilhar manualmente e revogar; listar ativo/resgatado/expirado/revogado, autor e datas, com paginação.
- Token CSPRNG de 32 bytes, URL-safe. Persistir apenas hash; exibir/copiar link completo no momento da emissão. Se perder o link, revogar e gerar outro, não prometer recuperar segredo armazenado só como hash. Retry de emissão devolve o ID/status sem token: a UI permite revogar/reemitir o convite ainda não usado, com nova chave; nunca cria uma segunda emissão silenciosa.
- Resgate exige posse do token e sessão válida; **abrir link/preview não concede saldo**, nem bots que geram prévia consomem o convite.
- Benefício de boas-vindas uma vez por conta, com índice único de grant welcome. Proposta: conta nova ou existente sem benefício anterior pode resgatar (D4); segunda tentativa da mesma conta no mesmo convite devolve sucesso idempotente; outro convite não soma 15 novamente e não consome o link que ainda pode servir a outro elegível.
- Concluir claim do link + ledger + carteira na mesma transação, com locks em ordem estável. Duas contas concorrentes: só uma recebe. Usuário já beneficiado não deve queimar o convite. Não alegar impedir toda fraude por múltiplas identidades humanas.
- Não vincular ou resgatar automaticamente só por email: o registro atual autoconfirma email; posse do link é condição obrigatória. Se futuramente exigir destinatário específico, implementar prova real de posse antes dessa modalidade.

### R-INV-03 — link abre com e sem app

Link canônico em domínio controlado/configurado, por exemplo `/convite#<token>` (fragmento lido pelo cliente, não enviado no request HTTP); domínio literal e URLs das lojas serão verificados na implementação, sem inventar slugs da App Store/Play. Landing pública mínima explica “Receba 15 créditos”, mostra validade/estado sem expor dados do destinatário, oferece entrar/criar conta e abrir/instalar o app.

MVP confiável: ativar o convite na web após login/cadastro, ou abrir `caloria://invite/<token>` com o app instalado; persistir convite pendente através de auth/onboarding. Após resgate, saldo fica no servidor e aparece no mesmo usuário em qualquer plataforma. Sem app instalado, permitir ativação web e depois instalar/entrar, ou instruir a voltar ao link após instalar. **Não prometer que a App Store transporta o token automaticamente.**

Validar login email/senha na landing; Google/Apple web somente se já suportados e verificados, sem fingir equivalência com SDK nativo. Não transportar token em query/path HTTP ou analytics/referrers; redigir token de logs, evitar analytics na landing e aplicar Referrer-Policy. Limitar previews/claims por IP/conta/token. Links em HTTPS não abrem nativamente hoje: Universal Links/Android App Links são fase opcional e exigem associações e novo binário, não apenas JS/OTA.

## 6. APIs propostas (ainda não existem)

| Endpoint | Acesso | Contrato essencial |
|---|---|---|
| `GET /credits/me` | autenticado | saldo, reservado, disponível, policy_version e tarifas; unidades inteiras canônicas + texto de apresentação |
| `GET /credits/ledger?cursor=...` | autenticado | só extrato próprio, paginação por chave estável |
| `GET /credits/operations/:id` | proprietário | estado e resultado recuperável da própria operação |
| `GET /admin/credit-invites` | admin | lista paginada, sem token bruto/hash na resposta |
| `POST /admin/credit-invites` | admin | identificação interna opcional; grant/uso fixos no servidor; Idempotency-Key; devolve link uma vez |
| `POST /admin/credit-invites/:id/revoke` | admin | idempotente; não revoga saldo já resgatado |
| `POST /credit-invites/preview` | público limitado | token no corpo; apenas validade/estado público, sem claim |
| `POST /credit-invites/redeem` | autenticado | token no corpo, resgate atômico/idempotente |

Nos endpoints existentes de scanner/chat acrescentar chave de operação e recibo de crédito de forma aditiva/versionada; manter formato dos resultados para clientes compatíveis. Não receber user_id como autoridade. Adicionar `Idempotency-Key` à configuração CORS observada e testar preflight web. Códigos: 400 inválido, 401 sem sessão, 402 saldo, 404 admin oculto/recurso de terceiro, 409 conflito/em processamento, 410 convite indisponível, 429 limite, 503 carteira. Mensagens de convite não revelam conta/email de terceiros.

## 7. UX de crédito

- Saldo discreto em Hoje/Perfil/Coach; extrato acessível sem nova tab global.
- Antes de analisar: “Analisar foto · 3 créditos”. Antes do chat, explicar “5 mensagens, somando você e o coach, usam 1 crédito”; se D1 aprovada, informar 0,2/mensagem e 0,4/troca.
- Mostrar reservado separado do disponível; não simular débito local definitivo. Revalidar no foco, depois de claim/consumo e após recuperar request pendente.
- Sem saldo: explicar quanto falta; preservar texto digitado/foto quando seguro; oferecer consultar saldo/resgatar convite. Não inventar botão Comprar/checkout sem escopo de pagamento.
- Falha de saldo/rede distinta de saldo zero. Loading, vazio, expirado, já usado, revogado, retry e estado recuperável em todos os fluxos.
- Logout troca todo estado pelo usuário novo, limpa cache de carteira/requests; não creditar outra conta por resultado tardio. Confirmar conta antes do claim, com opção trocar.

## 8. Rollout e compatibilidade

Separar **entrega iOS** e **ativação de cobrança**. Primeiro publicar correção visual JS e verificar seu update no iPhone 13; se forem necessárias alterações nativas, produzir build e verificar a loja. Depois migrations aditivas, backend com enforcement desligado, admin/convites e clientes compatíveis. Flags propostas e novas: `CREDITS_ENFORCEMENT_ENABLED` e `CREDIT_INVITES_ENABLED`, ambas false por default, a implementar no backend.

Não usar flag do frontend como autorização financeira. Não ativar cobrança global enquanto builds antigos conseguem chamar IA sem idempotência/saldo: definir versão/capacidade mínima, verificar cohorts atendidas e recusar cliente incompatível com erro explícito que oriente atualização **antes** da inferência, sem deixar rota alternativa gratuita. O scanner guest atual fica protegido pelas cotas existentes até a decisão D3; não o remover silenciosamente nem liberar uso anônimo ilimitado.

Usuários existentes não recebem 15 automaticamente; carteiras nascem com zero. Antes do enforcement, definir migração/acesso dessas contas (convite único ou grant autorizado auditado), informar mudança e assegurar acesso aos dados. Conta de revisão App Store precisa de fluxo de teste/saldo auditado suficiente; não criar bypass secreto de cobrança ou admin baseado no email.

Rollback de incidente: desligar enforcement/invites, interromper novas reservas, preservar saldo/ledger, reconciliar operações em voo; não apagar tabelas ou restituir em massa sem verificar execução. Rollback para uso temporariamente gratuito é decisão operacional explícita, jamais fail-open automático.

## 9. Decisões necessárias antes da ativação

| ID | Proposta / pergunta | Gate |
|---|---|---|
| D1 | Frações de 0,2/mensagem ou blocos inteiros? Proposta: frações | Antes da integração de cobrança |
| D2 | Cobrar só análise/turno concluído, estornar falha/sem comida/segurança? Proposta: sim | Antes de liquidar débitos |
| D3 | Tarifa/inclusão de dieta, transcrição e demonstração guest; tratamento de usuários existentes; crédito de uso vs preço em reais | Antes do enforcement global |
| D4 | Convite de uso único, validade 7 dias; conta existente sem welcome também elegível? Proposta: sim | Antes de emissão pública |

Sem resposta, os documentos seguem como proposta; não transformar silêncio em aprovação nem criar cobrança divergente. Criar os contratos/tabelas pode avançar com flags off, mas os gates não podem ser apresentados como resolvidos.

## 10. Aceite e harness

- iPhone 13: cortes reproduzidos/diagnosticados e corrigidos com antes/depois; todo CTA alcançável; cenários da matriz capturados. Native Dynamic Type/VoiceOver/teclado verificados manualmente.
- 15 → uma foto → 12; uma troca → 11,6 sob D1; cinco mensagens faturáveis = 1. Soma consistente entre aparelhos e conversas.
- Saldo insuficiente/não consultável: zero inferências; usuário continua lendo dados.
- Mesmo request repetido/concluído/timeout: um débito; concorrência nunca deixa saldo negativo; retry não duplica mensagem, dieta ou grant.
- Só admin legítimo emite/revoga; adulterar perfil/JWT/cliente não promove nem concede saldo. Testar privilégios PostgREST e SQL reais em ambiente isolado.
- Link não gasta ao abrir; resgate único concede exatamente 15; race entre contas tem um vencedor; elegibilidade negada não queima link; convite sobrevive ao login/onboarding.
- Sem app instalado: fluxo web/install/voltar ao link funciona; nenhum claim em cima de email não verificado.
- Migrações, testes unitários e integração PostgreSQL com concorrência real, API, Jest/TypeScript e bundle/web build verdes. Mocks não comprovam locks/RLS.
- A entrega documenta o que é JS/OTA, o que exige novo build, schema remoto, flags, validação de aparelho e o que ainda está pendente.

## Referências

- Código e caminhos citados, conferidos nesta main; specs anteriores de admin e OTA são contexto, não prova de telas implementadas.
- [React Native Text — escala de fonte](https://reactnative.dev/docs/text#allowfontscaling).
- [Apple HIG — Layout](https://developer.apple.com/design/human-interface-guidelines/layout): aplicar com validação no aparelho; página exige renderização no ambiente consultado.
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/): futura venda de crédito digital exige análise de 3.1.1/storefronts; este MVP não implementa pagamento e não é garantia de aprovação da Apple.
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security): policies e grants precisam ser testados em conjunto.
