# E-mail transacional

Referência para quem opera o e-mail de recuperação de senha. Spec: `docs/superpowers/specs/2026-10-23-link-app-creditos-manuais-email-oficial.md` (seção 03).

É só configuração e conteúdo: nada muda no código do app ou do backend, e não precisa de build.

## Provedor e remetente

- Provedor recomendado: **Resend** (configuração simples, cota gratuita suficiente, domínio verificado por DNS). Amazon SES, Brevo e Postmark funcionam igual.
- Remetente: **`CalorIA <nao-responda@caloriaoficial.com.br>`**.

## DNS de `caloriaoficial.com.br`

Sem estes registros o e-mail cai no spam. O painel do provedor mostra os valores exatos; copie de lá.

| Registro | Para que serve |
|---|---|
| SPF (TXT) | autoriza o provedor a enviar em nome do domínio |
| DKIM (TXT ou CNAME) | assina cada e-mail; o provedor gera a chave |
| DMARC (TXT em `_dmarc`) | política para e-mails que falham SPF/DKIM; comece com `p=none` e endureça depois |

Espere o provedor marcar o domínio como verificado antes de seguir.

## Modelo versionado

`backend/supabase/templates/recovery.html` é a fonte do e-mail "Redefinir senha". Edite o arquivo, rode `npx vitest run src/shared/email-templates.test.ts` e cole o conteúdo de novo no painel. A variável `{{ .ConfirmationURL }}` não pode mudar: o fluxo atual abre `/reset-password` por ela.

## Passos no painel do Supabase

1. **Authentication → Emails → SMTP Settings**: ligar SMTP próprio com host, porta, usuário e senha do provedor; remetente `nao-responda@caloriaoficial.com.br`, nome `CalorIA`.
2. **Email Templates → Reset Password**: assunto `Redefina sua senha do CalorIA` e corpo igual ao de `recovery.html`.
3. Os outros modelos que estiverem ligados no projeto (confirmação de cadastro, troca de e-mail) recebem o mesmo tratamento: português e marca, para o usuário não receber um e-mail oficial e outro genérico.
4. **Authentication → Rate Limits**: subir o limite de e-mails por hora para um valor de produção (o padrão é baixo demais com SMTP próprio).

## Aceite

Pedir a recuperação com um e-mail que **não seja da equipe** do projeto Supabase (uma conta Gmail e uma Outlook). O e-mail deve:

- chegar na caixa de entrada, não no spam;
- vir de `nao-responda@caloriaoficial.com.br`, em português e com a marca;
- ter um link que abre `/reset-password`, onde a troca de senha funciona.
