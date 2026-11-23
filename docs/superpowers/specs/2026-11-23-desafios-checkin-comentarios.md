# Spec: criar desafio, check-in de hoje e caixa de comentário

**Data:** 23/11/2026 · **Origem:** feedback do Rafael (iPhone).

## 1. "Criar e convidar" pergunta "Descartar alterações?" e duplica desafios
- **Causa:** o aviso de descarte (`useConfirmDiscard`) escuta toda saída da tela. Depois de
  criar, a tela chama `navigation.replace` com o título ainda preenchido, e o aviso aparece.
  O desafio **já foi criado** nesse momento. "Continuar editando" mantém a tela aberta, e cada
  novo toque em "Criar e convidar" cria **outro** desafio. "Descartar" só conclui a navegação.
- **Mesmo bug em Criar post:** depois de publicar, `navigation.goBack()` dispara o aviso.
- **Correção:** o hook devolve `allowExit()`. A tela chama `allowExit()` depois de salvar com
  sucesso, e a navegação seguinte sai sem perguntar. Voltar sem salvar continua perguntando.

## 2. "Check-in de hoje" não muda depois do toque
- **Causa:** o app não sabe se o usuário já fez o check-in de hoje. A lista de desafios não
  traz isso, e o botão continua igual depois do sucesso.
- **Backend:** `GET /challenges` (e criar/entrar/convite) passa a trazer
  `myLastCheckIn: 'YYYY-MM-DD' | null`, o último check-in do usuário naquele desafio. O campo
  é novo e opcional para o app: versões antigas o ignoram.
- **App:** se `myLastCheckIn` for hoje (data local), o botão vira o selo
  **"✅ Check-in feito"**, sem toque. Depois de um check-in com sucesso, ou da resposta
  `ALREADY_CHECKED_IN`, o app marca o desafio como feito hoje, sem esperar a lista recarregar.

## 3. Comentários: a caixa de texto fica atrás do teclado (iPhone)
- **Causa:** o `KeyboardAvoidingView` mede a posição relativa à tela-mãe, não ao topo do
  aparelho. A tela Comentários tem cabeçalho, e sem `keyboardVerticalOffset` o recuo fica
  menor que o teclado pela altura do cabeçalho (cerca de 100 px). A caixa some atrás do
  teclado. O Coach não tem cabeçalho e por isso funciona.
- **Correção:** `keyboardVerticalOffset` igual à altura do cabeçalho
  (`HeaderHeightContext`, de `@react-navigation/elements`, que já vem com o native-stack).
  Android sem mudança: o manifest já usa `adjustResize`.

## Fora do escopo
- Apagar os desafios duplicados que já foram criados.

## Entrega
Backend pela Vercel, app por OTA. Não há migração nem mudança nativa.
