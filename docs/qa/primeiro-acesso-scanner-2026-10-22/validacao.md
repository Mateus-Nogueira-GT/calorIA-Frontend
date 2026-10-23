# Validação — primeiro acesso e porções no scanner

Data: 22/10/2026. Base: origin/main 06a7854. Branch: fix/primeiro-acesso-scanner-porcoes.

## Ciclos red/green

- `cd app && npm test -- --runInBand __tests__/App.startup.test.tsx`: antes, RootNavigator já estava montado durante promessa pendente. Depois, loading até conclusão/erro/6 s; desmontagem limpa o timer. O teste mede a montagem, não reproduz o corte CoreText.
- `cd app && npm test -- --runInBand src/features/scanner/components/ScanItemRow.test.tsx`: antes, "Peso estimado: 200 g" e campo em gramas não existiam. Depois, peso, edição com vírgula, estado inválido e fallback legado passam.
- `cd backend && npm test -- src/modules/scanner/scanner.service.test.ts`: antes, o PF retornava 1 item, embora o provedor de teste entregasse arroz e frango. Depois, retorna 2 itens com pesos e macros individuais.

## Resultado final

| Verificação | Resultado |
|---|---|
| App, suíte completa `npm test -- --runInBand` | 105 suítes / 720 testes passaram |
| Backend, suíte completa `npm test` | 43 arquivos / 433 testes passaram; 51 testes de integração opt-in pulados |
| Persistência em PostgreSQL 17 descartável local | 2 testes passaram, separadamente |
| App `npm run type-check` | passou |
| Backend `npm run typecheck` e `npm run build` | passaram |
| Bundle JS release Android e iOS (`react-native bundle --dev false`) | passaram; não são builds nativos nem instalação |
| Biome nos 12 arquivos backend relevantes | passou |
| ESLint focado app | sem erros novos; regra no-raw-text tem 3 falsos positivos anteriores nos filhos string do Button próprio em ScanResultScreen. Com essa regra desabilitada, 0 erros / 4 avisos no-void |
| Detector Impeccable nos componentes alterados | lista vazia; não substitui renderização nativa |
| `git diff --check` | passou |

O Metro emitiu o aviso existente sobre extender @react-native/metro-config. Testes existentes do Dashboard emitem avisos act() e Node emite aviso de localStorage; não foram ocultados. Não são prova de reprodução visual no dispositivo.

O PostgreSQL foi iniciado num container local novo, sem volume persistente, com porta aleatória vinculada a 127.0.0.1. O harness aplica as migrations existentes 003 e 022 a esse banco descartável, valida quantity_g e nutrientes gravados, preservação do peso no PATCH e isolamento entre usuários. Não houve SQL remoto nem migration nova.

Para repetir a integração, iniciar um PostgreSQL vazio local com database `caloria_scanner_test` e rodar, no backend:

```sh
SCANNER_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:PORTA/caloria_scanner_test npm test -- src/modules/food-log/food-log.integration.test.ts
```

A variável é exclusiva do harness novo. Ele recusa host remoto ou nome sem scanner_test e recria schemas no banco descartável. Não usar credenciais/banco da aplicação.

## Comportamentos cobertos

- PF com alimentos separados, IDs próprios e macros por peso; preparação misturada com peso total, inclusive energia acima de 3000 kcal.
- Versionamento de hash/cache, cache atual multi-item, descarte de cache agregado, NOT_FOOD, análise vazia e peso inválido.
- Revisão de 200 g para 100 g reduz nutrientes pela metade, com precisão interna preservada; tela, total e payload usam o mesmo estado.
- Resultados antigos sem peso não são apresentados como 100 g. O fallback de 100 g na gravação antiga é mantido por compatibilidade; não é usado para inventar estimativa visual.
- Confirmação parcial conserva apenas alimentos pendentes e não duplica os já salvos. Guards de dono/sessão/tentativa permanecem.
- Primeiro render do Dashboard sem dieta tem zero e saudação com lineHeight proporcional.
- OTA lento/erro não bloqueia o app indefinidamente; download ao atingir a janela de 6 s não dispara reload tardio.

## Limites e aceite em dispositivo

Ainda não encerrado no hardware: causa específica do corte na instalação reportada. A correção de Text já está na base; a montagem antes da checagem OTA é confirmada por teste. A hipótese de bundle antigo precisa da versão/build e de uma instalação limpa em iPhone. Não foi inventada correção de layout adicional sem reprodução.

Não há Xcode/simctl disponível. Testar no iPhone: instalação limpa online → cadastro completo → Dashboard inicial zero; repetir com fonte ampliada, offline e rede lenta. Registrar versão/build, updateId e screenshot. Reiniciar e comparar. Uma nova build de loja com o bundle corrigido é necessária para garantir a correção já embutida na primeira execução; um OTA não altera o bundle embutido do binário antigo.

Inferência real com fotos originais de PF e panela continua pendente. Os anexos recebidos são screenshots dos resultados, não fotos originais de comida; não foram usados como prova de precisão do modelo. Validar separação de alimentos distinguíveis e quantidade total estimada com revisão humana.

Ordem de entrega recomendada: backend antes do app. O app novo tolera respostas antigas; clientes antigos toleram a lista com o novo campo opcional. Resultados idempotentes já concluídos continuam recuperáveis, sem reanálise/cobrança automática. Sem publicação nesta tarefa.
