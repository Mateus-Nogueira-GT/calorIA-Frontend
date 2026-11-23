# Plano: criar desafio, check-in de hoje e caixa de comentário

Spec: `docs/superpowers/specs/2026-11-23-desafios-checkin-comentarios.md`

## Tarefa 1: `allowExit` no aviso de descarte
1. Teste em `useConfirmDiscard.test.ts`: depois de `allowExit()`, a saída não é bloqueada e
   não há alerta.
2. `useConfirmDiscard` guarda um ref `exitAllowed` e devolve `{ allowExit }`. Com o ref
   ligado, o listener não chama `preventDefault`.
3. `CreateChallengeScreen` e `CreatePostScreen` chamam `allowExit()` antes de navegar,
   depois de salvar com sucesso.

## Tarefa 2: backend `myLastCheckIn`
1. Teste: `toChallenge` / listagem devolve `myLastCheckIn`.
2. `selectChallenge` seleciona `last_check_in` do membro ativo; o schema ganha
   `myLastCheckIn: z.string().nullable()`.

## Tarefa 3: selo "✅ Check-in feito"
1. Teste do `ChallengeCard`: com `checkedInToday`, mostra o selo e não mostra o botão.
2. Teste do store: depois de `checkIn` com sucesso (ou `ALREADY_CHECKED_IN`), o desafio fica
   com `myLastCheckIn = hoje`.
3. `ChallengesScreen` passa `checkedInToday={item.myLastCheckIn === todayString()}`.

## Tarefa 4: teclado nos comentários
1. `PostCommentsScreen` usa `keyboardVerticalOffset` com a altura do cabeçalho no iOS.

## Verificação
- Testes e type-check de app e backend, e lint.
- Preview web: abrir a tela de desafios e conferir o selo.
