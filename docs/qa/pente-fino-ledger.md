# Pente fino — ledger do loop de auditoria

Iniciado em 25/11/2026. Cada iteração do loop registra aqui a área revisada,
os achados (só conta como bug o que tem teste reproduzindo), o status e a branch.

Regras: nada de push, PR, OTA, migration remota ou flag de produção sem o usuário. Commits locais em
branches `fix/*`. Achado sem repro entra como "suspeito, não corrigido".

## Base

Local `main` estava em `f5ca5bf` (PR #70), 142 commits atrás de `origin/main`. O lote do debug de 18/10
(D01–D08) já foi corrigido e mergeado upstream. A auditoria roda sobre `origin/main` `4b6d53d` (PR #104),
no worktree `../calorIA-pente-fino`, para não tocar o checkout do usuário.

## Áreas a auditar (próximas iterações)

Backend: auth, users, scanner, food-log, diets, chat, challenges, feed, friends, weight,
notifications, admin, credits, credit-invites.
App: auth, scanner, dashboard/food-log, coach, social (feed/friends/challenges), credits/invites,
navigation, shared/services.

| Área | Iteração | Achados | Status |
|---|---|---|---|
| Baseline (typecheck, testes, lint) | 1 | Backend 598 ✓. App 849/849 ✓ com máquina livre; `ProfileSetupScreen`/`AddMealModal`/`ChatInput` estouram timeout só sob carga (flaky, não é bug de produto). Lint: 46 erros ESLint e alguns do Biome, todos de estilo (raw text dentro de `Button`, estilos não usados, `!`). | sem ação |
