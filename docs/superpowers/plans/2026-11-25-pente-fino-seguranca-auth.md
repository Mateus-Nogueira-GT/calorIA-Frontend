# Pente fino — segurança de auth: plano

**Spec:** [2026-11-25-pente-fino-seguranca-auth.md](../specs/2026-11-25-pente-fino-seguranca-auth.md)
**Branch:** `fix/pente-fino-4-seguranca` (worktree `../calorIA-pente-fino-4`). Só commits locais.

## Restrições

- TDD: escrever primeiro o teste que falha.
- Nenhuma chamada a Supabase ou serviços reais. O "Supabase" dos testes é um servidor HTTP local.
- Commit separado para R1, para facilitar cherry-pick e um hotfix isolado.
- Staging só de arquivos explícitos. Nada em `app/android` nem `app/ios`.

## Tasks

1. [ ] R1a: teste de forja (3 variantes de `iss` → 401; legítimo → 200; `aud` errada → 401) e
       `auth-issuer.test.ts` atualizado. Ver falhar.
2. [ ] R1b: issuer exato, JWKS de domínio fixo com `issuersWhitelist`, `allowedIss` e `allowedAud`.
       Conferir os testes que montam tokens (grep `iss`, `aud`, `sign(`) e ajustar as fixtures. Ver passar.
3. [ ] R1c: magic bytes no avatar, com testes (PNG/JPEG/WebP ok; JSON/SVG → 422). Commit R1.
4. [ ] R2: 429 no backend e no app (refresh). Commit.
5. [ ] R3: exclusão idempotente e timeout de 60 s. Commit.
6. [ ] R4: 401 em `/auth/*` não derruba a sessão. Commit.
7. [ ] R5: e-mail vazio no login social. Commit.
8. [ ] R6: logout revoga a sessão. Commit.
9. [ ] Fechamento: `npm run typecheck && npm test` no backend e `npx tsc --noEmit && npx jest` no app.
