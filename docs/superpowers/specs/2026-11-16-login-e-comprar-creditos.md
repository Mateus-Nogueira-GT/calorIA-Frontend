# Spec: botão Comprar créditos no scanner e mensagens do login

**Data:** 16/11/2026 · **Origem:** feedback do Rafael.

## 1. "Comprar créditos" não faz nada (scanner)
- **Causa:** o scanner abre como modal; a tela Comprar créditos era uma tela comum da pilha
  raiz e abria **atrás** do modal (no iPhone).
- **Correção:**
  - `BuyCredits` passa a abrir como modal, por cima do scanner;
  - no header, o botão **Fechar** volta para o scanner com a foto preservada.

## 2. "Credenciais inválidas" para qualquer falha de login
- **Causa:** o backend transformava todo erro do Supabase em 401 `INVALID_CREDENTIALS`, e o app
  mostrava a mesma frase genérica.
- **Correção no backend** (`loginUser`):

  | Código | Status | Quando |
  |---|---|---|
  | `GOOGLE_LOGIN_ACCOUNT` / `APPLE_LOGIN_ACCOUNT` | 401 | conta sem senha, criada pelo Google ou pela Apple (consulta `auth.users` + `auth.identities`) |
  | `EMAIL_NOT_CONFIRMED` | 403 | e-mail ainda não confirmado |
  | `TOO_MANY_ATTEMPTS` | 429 | excesso de tentativas no Supabase |
  | `AUTH_UNAVAILABLE` | 503 | Supabase fora do ar |
  | `INVALID_CREDENTIALS` | 401 | o resto |

  O motivo vai para o log (`login_failed`), sem o e-mail. Uma falha na consulta do provedor
  cai no genérico.
- **Correção no app:** a mensagem passa a ser escolhida pelo código (`loginErrorMessage`). Conta
  do Google ou da Apple → indica o botão certo ou "Esqueci minha senha" para criar uma senha.
- **Privacidade:** só a conta criada por Google/Apple revela que existe. E-mail inexistente
  continua com a mensagem genérica.

## Entrega
Backend pela Vercel, app por OTA. Não há migração.
