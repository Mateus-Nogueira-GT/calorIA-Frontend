# Link do convite no app, créditos manuais e e-mail oficial

Data: 23/10/2026. Base: main `6744f51`.
Status: **proposta para revisão**. Nada implementado.

Cobre três pedidos de 23/10: o link de créditos que abre no navegador (01), a liberação manual de créditos (02) e o e-mail de recuperação de senha que sai com a cara do Supabase (03).

## 01 — O link de convite abre o site em vez do app

### Diagnóstico

O link gerado na Administração é `https://calor-ia-frontend.vercel.app/convite#<token>` (`INVITE_PUBLIC_URL` + token no fragmento). Um link `https` só abre um app se o sistema confirmar que o domínio pertence àquele app. Essa confirmação **nunca foi configurada**, e o próprio código registra isso (`RootNavigator.tsx`, comentário do `linking`):

| Plataforma | O que falta |
|---|---|
| iOS | entitlement `com.apple.developer.associated-domains` e o arquivo `apple-app-site-association` servido pelo domínio |
| Android | `intent-filter` `https` com `android:autoVerify="true"` e o arquivo `assetlinks.json` servido pelo domínio |

Sem isso, iOS e Android tratam o link como um site comum. Não é defeito de redirecionamento: o app nunca reivindicou o domínio.

O app já sabe ler o token de uma URL `https://…/convite#token` (`inviteTokenFromURL` em `features/invites/store.ts`). Falta só o sistema entregar a URL ao app.

**"Rafael Teste @ Actívia" não é um dado da página.** No print, a folha "Iniciar Sessão… com a senha de rafaelteste@active.com" é o **preenchimento automático do iCloud Keychain**. É a senha que o próprio iPhone do Rafael guardou para esse site, e só ele vê. A página não exibe nem vaza esse e-mail. Nada a corrigir; com domínio próprio, o rótulo "vercel.app" da folha passa a ser o do CalorIA.

### Decisões

| # | Decisão |
|---|---|
| L1 | **Domínio próprio para os links: `app.caloriaoficial.com.br`**, apontado para o mesmo projeto da Vercel. O site institucional `caloriaoficial.com.br` continua onde está. Motivos: a marca aparece no link compartilhado no WhatsApp, e o domínio deixa de depender do nome do projeto na Vercel. *Alternativa sem DNS:* usar `calor-ia-frontend.vercel.app`, que também funciona tecnicamente. |
| L2 | Só o caminho **`/convite`** abre o app. O resto do domínio continua sendo o app web (login, `/reset-password`, admin no computador). |
| L3 | **Sem o app instalado**, o link abre a página de convite no navegador, como hoje: o resgate pode ser concluído ali, e a página ganha os botões **App Store** e **Google Play**. O token não sobrevive à instalação (deep link diferido fica fora). O texto atual da tela já avisa isso. |
| L4 | Links já enviados no domínio `vercel.app` **continuam funcionando** no navegador. Só os novos abrem o app. |

### Comportamento esperado

| Situação | Resultado |
|---|---|
| App instalado, toque no link (WhatsApp, Mensagens, e-mail) | Abre o app direto na tela de convite |
| App não instalado | Abre a página de convite no navegador, com resgate e botões das lojas |
| Link colado na barra do Safari/Chrome | Abre no navegador. É regra do sistema: link digitado não abre app |

### Restrições

- Entitlement e `intent-filter` são **nativos**: exigem build nova nas duas lojas, e OTA não resolve.
- O `assetlinks.json` precisa da impressão SHA-256 da **chave de assinatura do app** da Play (Play Console → Integridade do app), que é diferente da chave de upload do EAS. Inclui-se também a do EAS, para builds instaladas fora da Play.
- O App ID na Apple precisa da capability **Associated Domains**. O EAS a habilita sozinho ao assinar, porque ela vem do entitlement.

### Aceite

No iPhone e no Android, com a build nova instalada, tocar no link recebido pelo WhatsApp abre o app na tela de convite e o resgate credita a conta. Desinstalado, o mesmo link abre a página web com os botões das lojas.

## 02 — Liberação manual de créditos

### O que existe

O admin só gera links de convite (75 unidades = 15 créditos, uma vez por conta). A spec de 21/10 (D3) deixou o **crédito direto a usuário** de fora; este pedido o traz. A aba **Usuários** já lista contas com busca e saldo. O ledger aceita só `welcome` e `debit`, é append-only e protegido por trigger.

### Decisões

| # | Decisão |
|---|---|
| C1 | **Adicionar créditos** a uma conta pela aba Usuários: atalhos de 15, 50 e 100 créditos, mais um campo livre de **1 a 1.000 créditos por liberação**, com uma observação opcional (ex.: "nutricionista parceira"). Cada liberação é uma linha nova no ledger (`kind = 'grant'`), com `actor_id` = admin. |
| C2 | **Acesso ilimitado** por conta, ligado e desligado pelo admin. A conta ilimitada **não reserva nem debita créditos**: a operação segue o mesmo caminho de quando a cobrança está desligada. O saldo fica guardado e volta a valer quando o admin desligar. |
| C3 | **O teto diário de IA continua valendo para contas ilimitadas** (`AI_QUOTA_EXCEEDED`). "Ilimitado" é ilimitado em créditos, não em custo. Uma conta compartilhada por um influenciador não pode virar uma conta de IA aberta. |
| C4 | **Remover créditos fica fora.** Errou a quantidade? Liberações são pequenas, e o ilimitado se desliga. Débito manual pediria um tipo novo de lançamento e uma revisão do ledger. |
| C5 | Liberação **idempotente** pelo cabeçalho `Idempotency-Key`, como a criação de convites: um toque duplo ou uma nova tentativa da rede não credita duas vezes. |
| C6 | **Visibilidade:** a linha do usuário mostra o selo **Ilimitado**; a tela de créditos do próprio usuário mostra "Créditos ilimitados" no lugar do saldo; a Visão geral passa a separar "liberados manualmente" das boas-vindas e dos convites. |
| C7 | Não depende da flag de convites (`CREDIT_INVITES_ENABLED`). |

### Fora do escopo

Lote de liberações, validade dos créditos liberados, extrato por usuário na tela, papel de admin para outras pessoas (continua só por SQL, D4 de 21/10).

### Aceite

O Rafael encontra uma conta pela busca, libera 50 créditos e vê o saldo da linha subir 50. Liga o ilimitado em outra conta, ela analisa fotos com saldo zero, e o selo aparece. Desligado o ilimitado, a conta volta a ser cobrada pelo saldo guardado.

## 03 — E-mail de recuperação de senha oficial

### Diagnóstico

O backend chama `resetPasswordForEmail` do Supabase, e o Supabase envia pelo **SMTP embutido dele**. O remetente é `noreply@mail.app.supabase.io`, com o modelo padrão em inglês. Esse SMTP é feito para testes: tem limite de poucos e-mails por hora no projeto todo e não é recomendado para produção. Dependendo do plano e da data de criação do projeto, ele pode entregar **só para endereços da equipe do projeto**. Isso precisa ser verificado: se valer aqui, usuários reais nem recebem o e-mail.

### Decisões

| # | Decisão |
|---|---|
| E1 | **SMTP próprio no Supabase** (Authentication → Emails → SMTP Settings), com um provedor transacional. **Recomendado: Resend**: configuração simples, cota gratuita suficiente para o volume atual e domínio verificado por DNS. Funcionam igual: Amazon SES, Brevo, Postmark. |
| E2 | Remetente **`CalorIA <nao-responda@caloriaoficial.com.br>`**, com SPF, DKIM e DMARC no DNS de `caloriaoficial.com.br`. Sem isso o e-mail cai no spam. |
| E3 | Modelo **em português, com a marca**, versionado no repositório e colado no painel. Assunto: **"Redefina sua senha do CalorIA"**. O link continua sendo `{{ .ConfirmationURL }}`, sem mudança no fluxo atual. |
| E4 | Os outros modelos de e-mail **que estiverem ligados** no projeto (confirmação de cadastro, troca de e-mail) recebem o mesmo tratamento, para o usuário não receber um e-mail oficial e outro genérico. |
| E5 | Com SMTP próprio, subir o limite de e-mails por hora (Authentication → Rate Limits) para um valor de produção. |

É só configuração e conteúdo: nada muda no código do app ou do backend, e não precisa de build.

### Aceite

Pedir a recuperação com um e-mail **que não seja da equipe** (Gmail e Outlook): o e-mail chega na caixa de entrada, não no spam, vindo de `nao-responda@caloriaoficial.com.br`, em português e com a marca. O link abre `/reset-password` e a troca de senha funciona.

## Ordem sugerida

1. **03** primeiro: é só configuração, pode estar resolvido hoje e destrava um fluxo que talvez esteja quebrado para usuários reais.
2. **02**: backend + JS do app. Chega por OTA, sem esperar loja.
3. **01** por último: depende de DNS e de build nova nas duas lojas, então entra no próximo ciclo de submissão.

## Pendências do dono do produto

- Confirmar **L1**: domínio `app.caloriaoficial.com.br`, ou ficar com o `vercel.app`.
- Acesso ao **DNS de `caloriaoficial.com.br`**: necessário para 01 (CNAME) e para 03 (SPF/DKIM).
- Escolher o **provedor de e-mail** (E1) e criar a conta.
