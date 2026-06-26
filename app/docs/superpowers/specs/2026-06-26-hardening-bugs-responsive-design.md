# Hardening — Bugs Acumulados & Responsividade Web — Design Spec (Spec 2)

**Data:** 2026-06-26
**Tipo:** sessão de debug/hardening (transversal, não-feature)
**Escopo:** itens do checklist:

- Bug fixes acumulados das fases anteriores — D37–D39
- Ajustes de responsividade — D43

> Consistência visual, animações e empty/error states estão no **Spec 1** (`2026-06-26-ui-polish-visual-design.md`).

## 1. Contexto

Ao longo das fases (auth, dashboard, coach, dieta, food-log, scanner, perfil, Comunidade, Tracking) acumularam-se defeitos conhecidos e pendências de robustez. Além disso, o app roda em **web** (`react-native-web` + Webpack) e precisa de ajustes de layout responsivo para telas largas.

Esta spec tem **duas partes independentes**: (A) uma fase de **auditoria → correção** de bugs, e (B) **responsividade web**. A auditoria gera a lista concreta de bugs; itens já catalogados durante o desenvolvimento entram direto.

**Premissa:** assume Comunidade (na `main`) e Tracking (PR #6) presentes. A correção do jest `@env` pode já estar parcialmente na `main` (veio com o módulo Comunidade) — a auditoria confirma o estado atual antes de agir.

## 2. Decisões-chave

| Decisão | Escolha | Razão |
|---|---|---|
| Fonte dos bugs | Fase de auditoria (descoberta) + itens já catalogados | Lista objetiva, sem achismo. |
| Critério de "bug" | Falha de teste, comportamento incorreto/frágil, ou achado Important/Minor registrado nos ledgers | Foco no que tem impacto real. |
| Correção | Cada bug com teste de regressão quando viável | Evita reincidência. |
| Responsividade | Apenas **web** (este escopo) | Decisão do usuário; nativo fica fora. |
| Layout web | `useWindowDimensions` + container com `maxWidth` + layouts fluidos | Sem libs; aproveita o que o RN-web oferece. |
| Verificação | Suíte verde/pristine + checagem manual em 3 larguras (375/768/1280) | Bug + responsividade exigem checagem real. |

## 3. Parte A — Auditoria & Correção de Bugs (D37–D39)

### 3.1. Fase de auditoria (descoberta)

1. **Suíte de testes:** rodar `npx jest` (a partir de `app/`) e catalogar todas as suítes/testes falhando, classificando: (a) falha de produto, (b) falha de infra de teste, (c) pré-existente não relacionada.
2. **Ledgers:** varrer os achados Minor/Important registrados em `.superpowers/sdd/progress.md` (e relatórios) dos módulos Comunidade e Tracking.
3. **Smoke manual (web):** `npm run web` e percorrer os fluxos principais anotando quebras.
4. **Saída:** uma **lista priorizada de bugs** (no plano de implementação), cada um com: arquivo, sintoma, severidade, e estratégia de fix + teste.

### 3.2. Itens já catalogados (entram na lista)

- **Config `@env` do jest:** suítes que importam `api.ts` (ex: `__tests__/App.test.tsx`, `DashboardScreen.test.tsx`) falham com `Cannot find module '@env'` quando o `moduleNameMapper`/mock não está presente. Confirmar o estado na `main` atual (o módulo Comunidade adicionou `__mocks__/@env.js` + mapper); garantir que a suíte inteira carrega.
- **Densidade da tab bar:** com Dashboard, Diário, (botão central de câmera), Coach, Comunidade, Perfil e Evolução, a bottom bar fica apertada. Avaliar enxugar (ex: mover algo para um menu "Mais") ou compactar labels/ícones.
- **`onEndReached` sem guarda** no Feed (pode disparar `loadMore` redundante) — adicionar guarda de `isLoadingMore`/`hasMore`.
- **`accessibilityLabel` ausente** no botão de comentários do `PostCard` e em ícones-só.
- **`PostCardSkeleton` usando `colors.white`** em vez de token de superfície (`brandSurface`).
- **`manualSeq` (scanner store)** não reseta entre execuções de teste; tornar determinístico.
- **`CameraAction` (tab)** navegável programaticamente (sem `tabPress` preventDefault) — guardar.
- **`ScannerStackScreenProps`** sem `CompositeScreenProps` (acesso ao pai não tipado) — opcional, melhora DX/type-safety.
- **Cobertura de teste do caminho de erro** em alguns stores (ex: `analyze`/`confirm` do scanner; `addComment` rollback do feed) — adicionar onde faltar.

> A correção do `@env` e o tsc/lint completos podem **revelar** falhas antes mascaradas — essas entram na lista da auditoria.

### 3.3. Correção

- Corrigir por ordem de severidade (Critical/Important antes de Minor).
- Cada correção: fix mínimo + **teste de regressão** (quando há comportamento testável); rodar a suíte da área.
- Itens puramente cosméticos que pertencem ao Spec 1 (tokens/empty states) **não** são duplicados aqui.

## 4. Parte B — Responsividade Web (D43)

### 4.1. Estratégia

- **Container com largura máxima:** conteúdo principal das telas centralizado com `maxWidth` (ex: 480–600px) em viewports largas no web, evitando linhas/elementos esticados de borda a borda no desktop.
  - Introduzir um helper/componente `ScreenContainer` (ou estilo compartilhado) que aplica `maxWidth` + centralização **apenas quando `Platform.OS === 'web'` e a largura excede o limite**, sem afetar o nativo.
- **`useWindowDimensions`** onde o layout precisa reagir à largura (grids, número de colunas, tamanho de gráficos como `WeeklyCalorieChart`/`WeightLineChart`).
- **Tab bar / headers:** garantir que cabem e não quebram em larguras estreitas e largas.
- **Listas/forms:** inputs e cards usam largura fluida com `maxWidth`; sem overflow horizontal.

### 4.2. Breakpoints de validação

- **~375px** (mobile estreito): nada corta/quebra; tab bar densa cabe.
- **~768px** (tablet/web médio): conteúdo não estica demais; `maxWidth` entra.
- **~1280px** (desktop): conteúdo centralizado com `maxWidth`; sem elementos full-bleed indesejados.

### 4.3. Não-objetivo

- Responsividade **nativa** (tablets/landscape) — fora deste escopo (decisão do usuário: só web).
- Layout multi-coluna/desktop "app-shell" — fora de escopo; só evitar quebras e esticões.

## 5. Arquitetura (arquivos prováveis)

```
app/                                ajustes de infra de teste se necessário (jest config/@env)
app/src/shared/components/
└── ScreenContainer.tsx             (novo, se adotado) maxWidth/centralização web + test

app/src/features/**                 fixes pontuais de bugs (por arquivo, conforme auditoria)
                                    + aplicação de ScreenContainer/useWindowDimensions nas telas
app/src/navigation/BrandTabNavigator.tsx   ajuste de densidade da tab bar (se decidido)
```

> A lista exata de arquivos é fechada na **fase de auditoria** do plano de implementação.

## 6. Testes & verificação

- **Bugs:** teste de regressão por correção; ao final, `npx jest` (de `app/`) deve rodar a suíte inteira sem falhas introduzidas (e idealmente destravando as pré-existentes do `@env`).
- **Responsividade:** `ScreenContainer` com teste (aplica maxWidth só em web/largura grande); checagem manual nos 3 breakpoints via `npm run web` (redimensionando a janela).
- Saída de testes **pristine**.

## 7. Fora de escopo

- Consistência visual/tokens, animações, empty/error states → **Spec 1**.
- Responsividade nativa (tablet/landscape).
- Refactors não relacionados a um bug específico.
- Performance/otimização de bundle (separado).

## 8. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Auditoria virar escopo aberto | Lista fechada na fase de auditoria do plano; novos achados viram follow-up. |
| Corrigir `@env` expor muitas falhas pré-existentes | Catalogar e priorizar; corrigir as de produto, marcar as de infra/terceiros. |
| `maxWidth` no web afetar o nativo | Aplicar condicional a `Platform.OS === 'web'` + largura; testar nativo continua full-width. |
| Enxugar a tab bar mudar navegação do usuário | Tratar como decisão de UX explícita; se controverso, manter e só compactar. |
