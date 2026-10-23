# Primeiro acesso e scanner por alimento/porção

## Evidência e escopo

Relatos de 22/10/2026: calorias e saudação cortadas após cadastro, normais depois de reabrir; foto de panela retorna um único total sem peso; PF deve listar arroz/frango/etc. com gramas e nutrientes individuais.

Base: origin/main 06a7854. Preservar navegação, identidade, cadastro, autenticação, créditos, cancelamento e recuperação de resultados. Não publicar, migrar banco ou alterar tarifas nesta implementação.

## Diagnóstico verificável

1. A correção de altura de linha já existe em Text desde bfcd6b7: fontSize 48 recebe lineHeight 58. Não há motivo comprovado para recalcular calorias ou forçar remount após cadastro.
2. App monta RootNavigator enquanto applyPendingUpdate está pendente. O bundle antigo pode mostrar o defeito até uma próxima abertura, especialmente se download ultrapassar a janela de 6 segundos. A versão/build do relato ainda não foi confirmada. A hipótese de bundle antigo é compatível com o código e o relato, não reprodução visual comprovada no iPhone.
3. Vision pede UM objeto com totais da porção inteira; não pede peso. O app aceita uma lista, mas só pode mostrar o que o servidor devolve. O cache antigo conserva o resultado agregado por 24 horas.

## Comportamento esperado

### R1 — Abertura e tipografia

- Na produção nativa, aguardar a tentativa inicial de OTA antes de montar a navegação, com loading acessível, limitado à janela já existente de 6 s.
- Sem update/offline/erro/fim da janela: liberar o app. Download tardio não recarrega formulário ou navegação em uso. Web/desenvolvimento não esperam atualização.
- A saudação e o total inicial zero mantêm altura de linha proporcional, com e sem metas e fonte ampliada. Não inventar metas nem reduzir Dynamic Type.
- Limitação de entrega: OTA não modifica o bundle embutido de um binário já distribuído. A garantia desde a primeira execução exige nova build de loja com esta inicialização e a correção de Text. Offline usa o bundle disponível.

### R2 — Análise por alimento

- Structured output contém is_food e items (limite de 20), cada item com nome, weightGrams estimado, kcal, proteína, carboidratos, gordura, fibra e confiança.
- PF: separar alimentos visualmente distinguíveis; nutrientes de cada item correspondem às suas gramas. Nunca devolver totais duplicados em cada item.
- Preparação misturada/panela: um item da preparação inteira quando não há como medir componentes separadamente; estimar o peso visível, sem inventar ingredientes ocultos nem tratar o recipiente inteiro como uma porção pessoal.
- Imagem sem comida: erro NOT_FOOD, como hoje. Resultado vazio/malformado ou peso inválido: falha recuperável, sem dados nutricionais fabricados.
- Guardrails por item; a proteção para kcal não deve achatar silenciosamente uma panela inteira a uma porção de até 3000 kcal. Limite de densidade por peso além do limite básico existente.
- Cache versionado para não reutilizar a análise agregada anterior. Mesmo resultado válido em cache recebe IDs novos. Operações idempotentes já concluídas continuam recuperáveis, sem nova cobrança automática.

### R3 — Revisão e confirmação

- Cada alimento mostra peso estimado em g, kcal e nutrientes; total é a soma dos itens restantes. Texto informa estimativa visual da quantidade inteira e pede revisão da porção consumida.
- Peso editável: ao mudar de 200 g para 100 g, nutrientes do item são reduzidos proporcionalmente; mudanças sucessivas não acumulam arredondamento. Vírgula decimal aceita. Peso fora de 0,1 a 100.000 g, vazio ou não finito é inválido (precisão da tela e da coluna NUMERIC), não zera os nutrientes e bloqueia a confirmação até corrigir.
- Resultado legado sem peso mostra "Peso não informado"; não inventar 100 g na tela. Permite informar peso sem alterar os nutrientes preexistentes até haver uma base válida.
- Campos existentes continuam editáveis. Item manual começa em edição.
- Confirmação envia cada alimento com seus próprios nutrientes e peso. Persistir o peso em meal_items.quantity_g, já existente, sem migration; clientes antigos mantêm o fallback de gravação atual. Edição de refeição sem informar peso preserva quantity_g existente.
- Manter falhas parciais sem duplicar itens salvos e todas as proteções de sessão/tentativa existentes.

## Aceite e limites de prova

Harness determinístico: OTA pendente/offline/timeout; Text inicial; PF com arroz/frango; preparação única; cache novo/antigo; não alimento; saída inválida; edição de peso e confirmação parcial. Testes de componente/serviço não comprovam qualidade da inferência real nem renderização CoreText no iPhone. Fotos fornecidas são screenshots, não as fotos originais dos alimentos; não chamar o provedor com elas como evidência de precisão.

Sem Xcode/simctl neste ambiente: teste físico iOS com instalação limpa/cadastro e fontScale padrão/ampliado fica pendente. Não confundir captura web com evidência nativa.
