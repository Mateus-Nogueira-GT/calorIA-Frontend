# UI Polish — Visual & Micro-interações — Design Spec (Spec 1)

**Data:** 2026-06-26
**Tipo:** sessão de debug/polish (transversal, não-feature)
**Escopo:** itens do checklist:

- Revisão geral de UI: consistência de espaçamentos, cores, fontes — D36–D37
- Animações e micro-interações (transições de tela, loading states) — D39–D40
- Empty states e telas de erro amigáveis — D40–D41

> Hardening funcional (bugs acumulados) e responsividade web estão no **Spec 2** (`2026-06-26-hardening-bugs-responsive-design.md`).

## 1. Contexto

O app CalorIA cresceu por fases (auth, dashboard, coach, dieta, food-log, scanner, perfil, Comunidade, Tracking). A identidade visual "VITAL LIGHT" já está tokenizada para **cores** (`app/src/theme/colors.ts`) e parcialmente para **tipografia** (`typography.fontSize/fontFamily/...`), mas:

- **Não existe sistema de tokens de espaçamento** — paddings/margins/gaps são números literais espalhados.
- **`fontSize` é usado de forma inconsistente** — telas mais antigas usam `typography.fontSize.*`, várias mais novas usam literais.
- **Empty/error states são duplicados por feature** (`EmptyFeedState`, `EmptyDietState`, `EmptyChallengesState`, `EmptyFoodLogState`...) sem um componente compartilhado; nem toda tela assíncrona cobre o estado de erro.
- **Animações/micro-interações** existem pontualmente (like animado, skeletons) mas não são padronizadas.

Esta spec é uma **passada de polish guiada por auditoria**: cada subárea começa com uma auditoria que gera um checklist concreto, seguida de migração/padronização incremental por feature, mantendo a suíte verde.

**Premissa:** assume os módulos Comunidade (na `main`) e Tracking (PR #6) presentes. Onde uma tela ainda não estiver mergeada, o item correspondente do checklist é aplicado quando ela existir.

## 2. Decisões-chave

| Decisão | Escolha | Razão |
|---|---|---|
| Espaçamento | Criar escala de tokens `spacing` (4-based) em `@theme` e migrar literais | Hoje não há sistema; é a maior fonte de inconsistência. |
| Tipografia | Impor `typography.fontSize.*` (migrar literais) | Tokens já existem; só faltam ser usados sempre. |
| Cores | Auditar e eliminar hex/rgba soltos (já bem tokenizado) | Manutenção; baixo volume esperado. |
| Empty/error | Componentes compartilhados `EmptyState` + `ErrorState` em `src/shared/components` | Remove duplicação; garante consistência e cobertura. |
| Animações | Animated API nativa (sem dependência nova) + presets do navigator | Consistente com o existente; evita peso nativo. |
| Migração | Incremental, por feature, guiada por checklist de auditoria | Reduz risco; cada passo testável. |
| Verificação | Testes de componente (EmptyState/ErrorState) + suíte verde/pristine + checklist visual manual | Polish é parte visual, parte testável. |

## 3. Parte A — Tokens & Consistência Visual (D36–D37)

### 3.1. Tokens de espaçamento (novo)

Criar `app/src/theme/spacing.ts` e exportar via `app/src/theme/index.ts`:

```ts
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;
```

- `radius` (raios) também é inconsistente (12/16/18/999). Incluir, no mesmo arquivo, uma escala mínima `radius = { sm: 8, md: 12, lg: 16, pill: 999 }` para padronizar cantos.

### 3.2. Auditoria + migração

- **Auditoria de espaçamento:** varrer `app/src` por `padding/margin/gap/borderRadius` numéricos literais nos `StyleSheet.create`; gerar checklist por arquivo. Migrar para `spacing.*`/`radius.*` (arredondando para o token mais próximo; mudanças visuais sub-pixel são aceitáveis).
- **Auditoria de fontSize:** varrer literais `fontSize: N`; migrar para `typography.fontSize.*` (token mais próximo). Inclui os ~13 literais já conhecidos nos componentes de Scanner/Food-log do módulo Tracking.
- **Auditoria de cor:** varrer hex (`#`) e `rgba(`/`rgb(` fora de `theme/`; substituir por tokens (`colors.*`). Esperado baixo volume.
- **Saída:** um checklist (no plano de implementação) lista os arquivos e o número de incidências; a migração é uma task por feature.

### 3.3. Escopo de migração (não-objetivo)

- Não redesenhar telas; só **substituir valores literais por tokens equivalentes**.
- Não introduzir regra de ESLint de enforcement nesta spec (follow-up opcional).

## 4. Parte B — Animações & Micro-interações (D39–D40)

### 4.1. Transições de tela

- Padronizar `screenOptions` nos navigators (`RootNavigator`, `CommunityNavigator`, `ScannerNavigator`, auth stack): `animation: 'slide_from_right'` para push; `presentation: 'modal'` (já usado) para modais. Garantir consistência (sem telas com transição default destoante).

### 4.2. Loading states

- Primitiva compartilhada `Skeleton` em `src/shared/components` (bloco cinza pulsante com `reduceMotion` honrado, como `MealCardSkeleton`), e refatorar `PostCardSkeleton`/`MealCardSkeleton`/skeletons soltos para compô-la.
- Garantir que **toda tela assíncrona** mostre skeleton ou spinner durante o carregamento inicial (auditoria por tela).

### 4.3. Micro-interações

- Hook reutilizável `usePressScale` (Animated.Value de escala em press-in/press-out) para botões/cards tocáveis principais (ex: `Card` com `onPress`, CTAs).
- Manter a animação de like existente; padronizar o "pop" via o mesmo utilitário onde fizer sentido.
- **Teste pristine:** qualquer teste que dispare animação deve drenar timers (`jest.useFakeTimers()` + `act(() => jest.runAllTimers())`).

### 4.4. Não-objetivo

- Sem biblioteca de animação nova (Reanimated/Lottie). Apenas Animated API + opções do React Navigation.

## 5. Parte C — Empty States & Telas de Erro (D40–D41)

### 5.1. Componentes compartilhados

Criar em `src/shared/components`:

- `EmptyState({ emoji?, title, subtitle?, actionLabel?, onAction? })` — layout centralizado (emoji/ícone + título + subtítulo + CTA opcional).
- `ErrorState({ title?, subtitle?, onRetry })` — variante de erro com "Tentar de novo" (default título "Algo deu errado").

Ambos usam tokens (`spacing`, `typography`, `colors`) e copy em PT-BR.

### 5.2. Consolidação

- Refatorar os empties por-feature (`EmptyFeedState`, `EmptyDietState`, `EmptyChallengesState`, `EmptyFoodLogState`/equivalentes, empty do Evolução/Scanner) para **usar** `EmptyState`/`ErrorState` (mantendo a copy específica via props), ou removê-los quando virarem só um wrapper fino.
- **Cobertura:** auditar cada tela de lista/async e garantir os 3 estados — carregando (skeleton), vazio (`EmptyState` com CTA), erro (`ErrorState` com retry). Onde faltar o estado de erro, adicioná-lo.

### 5.3. Telas de erro amigáveis

- Mensagens claras e acionáveis em PT-BR (sem stack traces); ícone/emoji acolhedor; sempre uma ação (retry ou navegação).

## 6. Arquitetura (arquivos)

```
app/src/theme/
├── spacing.ts                      (novo) spacing + radius
└── index.ts                        (extensão) exporta spacing/radius

app/src/shared/components/
├── EmptyState.tsx                  (novo) + EmptyState.test.tsx
├── ErrorState.tsx                  (novo) + ErrorState.test.tsx
├── Skeleton.tsx                    (novo) primitiva de skeleton
└── (componentes existentes migrados p/ tokens)

app/src/shared/hooks/
└── usePressScale.ts                (novo) micro-interação de toque

app/src/features/**                 migração incremental:
  - StyleSheet: literais → spacing/radius/typography tokens
  - empties/erros → EmptyState/ErrorState
  - skeletons → Skeleton

app/src/navigation/*                screenOptions de transição padronizados
```

## 7. Testes & verificação

- Unit: `EmptyState`/`ErrorState` (render de título/subtítulo/CTA; `onRetry`/`onAction` disparam); `usePressScale` (valor anima sem warning, fake timers).
- Regressão: suíte de cada feature migrada permanece **verde e pristine** após a troca por tokens/estados compartilhados.
- Manual (checklist no plano): cada tela conferida para os 3 estados e para a aplicação dos tokens.

## 8. Fora de escopo

- Bugs funcionais acumulados e responsividade web → **Spec 2**.
- Redesign de telas / nova identidade.
- Dark mode.
- Biblioteca de animação externa; regra de ESLint de enforcement de tokens (follow-up).

## 9. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Migração em massa quebrar layout sutilmente | Migrar por feature, rodar testes + checklist visual por tela; tokens escolhidos pelo valor mais próximo. |
| "Auditoria" virar escopo infinito | O checklist é fechado na fase de auditoria do plano; itens fora viram follow-up. |
| Consolidar empties alterar copy/UX | Preservar a copy específica via props; só trocar o layout-base. |
| Animações gerarem warnings de teste | Padrão de fake timers + `act` documentado. |
