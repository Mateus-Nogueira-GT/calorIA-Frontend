# Publicar o CalorIA na App Store sem Xcode (EAS Build)

O Xcode não está instalado na máquina de desenvolvimento (só as Command Line Tools) e o
chaveiro não tem nenhuma identidade de assinatura. O EAS Build compila em máquinas macOS
na nuvem e **cria os certificados sozinho** na conta da Apple — some a necessidade de
Xcode local e de gerar certificado à mão no portal.

Este documento é o passo a passo. O que já está pronto no repositório está marcado com ✅.

---

## Já configurado ✅

| Item | Onde |
|---|---|
| Bundle ID do app | `br.com.caloriaoficial.app` — igual ao `applicationId` do Android |
| Bundle ID dos testes | `br.com.caloriaoficial.app.tests` (targets não podem repetir) |
| Assinatura automática + Team | `CODE_SIGN_STYLE = Automatic`, `DEVELOPMENT_TEAM = Z7U2XD3LS9` |
| Perfis de build do EAS | `app/eas.json` |
| Geração do `.env` na nuvem | `app/scripts/eas-write-env.js` + hook `eas-build-pre-install` |

### Por que o hook do `.env` existe

O `app/.env` é gitignored e **não sobe** para o EAS. Sem ele, o `react-native-dotenv`
resolve `@env` como `undefined`, e `resolveBaseUrl` lança na inicialização do build de
release: o app abre e fecha na hora, sem mensagem. O hook recria o arquivo a partir das
variáveis de ambiente do EAS antes da instalação das dependências, e **falha o build** se
faltar alguma — melhor do que gerar um `.ipa` que crasha.

---

## O que você precisa fazer

### 1. Pare de criar o certificado no portal da Apple

Pode fechar aquela tela. Não crie nada em **Certificates**. O EAS gera o certificado de
distribuição e o provisioning profile na primeira build. Criar à mão agora só ocuparia um
dos **2 slots** de certificado de distribuição que a conta permite.

O **App ID** (`br.com.caloriaoficial.app`), esse sim, precisa existir — é a tela
"Register an App ID" que você já estava preenchendo. Sem Capabilities marcadas.

### 2. Crie o app na App Store Connect

Em [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **Apps** → `+`:

- **Plataforma:** iOS
- **Nome:** CalorIA
- **Idioma principal:** Português (Brasil)
- **Bundle ID:** selecione `br.com.caloriaoficial.app`
- **SKU:** qualquer identificador interno, ex. `caloria-ios`

Guarde o **Apple ID do app** que aparece na página (um número, algo como `6748291042`).
Ele é o `ascAppId` do passo 5.

### 3. Conta Expo e login

```bash
cd app
npx eas-cli@latest login        # cria/entra na conta Expo
npx eas-cli@latest init         # vincula o projeto à conta
```

O `init` grava um `projectId` no `app.json`. **Commite essa alteração.**

### 4. Cadastre as variáveis de ambiente

São as que o hook do `.env` espera. Pelo painel (Project → Environment Variables) ou:

```bash
npx eas-cli@latest env:create --name API_BASE_URL --value "https://calor-ia-frontend.vercel.app/api" --environment production
npx eas-cli@latest env:create --name API_TIMEOUT --value "10000" --environment production
npx eas-cli@latest env:create --name APP_WEB_URL --value "https://calor-ia-frontend.vercel.app" --environment production
```

`GOOGLE_WEB_CLIENT_ID` é opcional e pode ficar de fora: as bibliotecas de login social
não estão instaladas e os botões ficam ocultos.

### 5. Complete o `eas.json`

Em `app/eas.json`, no bloco `submit.production.ios`, troque
`PREENCHER_APOS_CRIAR_O_APP_NA_APP_STORE_CONNECT` pelo número do passo 2, e acrescente o
e-mail da conta Apple:

```json
"ios": {
  "appleId": "email-do-cliente@exemplo.com",
  "appleTeamId": "Z7U2XD3LS9",
  "ascAppId": "6748291042"
}
```

### 6. Primeira build

```bash
cd app
npx eas-cli@latest build --platform ios --profile production
```

Ele vai perguntar sobre as credenciais da Apple. **Escolha deixar o EAS gerenciar**
(`Let EAS handle it` / "Generate new Apple Distribution Certificate"). Você entra com o
Apple ID do cliente e, se houver verificação em duas etapas, digita o código. É a única
etapa interativa.

A build entra numa fila — no plano gratuito pode demorar bastante. Ao final, o `.ipa`
fica disponível para download e envio.

### 7. Enviar para a App Store Connect

```bash
npx eas-cli@latest submit --platform ios --profile production --latest
```

### 8. Preencher a ficha na App Store Connect

Antes de submeter para revisão:

- **Privacidade:** informe a URL `https://caloriaoficial.com.br/politica-de-privacidade`
- **App Privacy:** o equivalente ao formulário de Segurança dos dados do Google. As
  respostas são as mesmas que levantamos, incluindo o compartilhamento das fotos com
  **OpenRouter e OpenAI** (o provedor é o OpenRouter; a OpenAI recebe via ele)
- **Exclusão de conta:** a Apple também exige, e já existe no app (Perfil → Excluir conta)
- Capturas de tela, descrição, categoria e classificação etária

---

## Armadilhas conhecidas

**A política publicada ainda se autoexclui do app.** O texto no ar diz que se aplica
"exclusivamente ao site institucional" e que não coleta dados pessoais — o que contradiz o
app e foi provavelmente o que reprovou o formulário no Google. O texto corrigido está em
`docs/politica-de-privacidade.md` e **precisa ser publicado no site** antes de submeter à
Apple, ou o problema se repete.

**Versão e build.** O projeto está em `MARKETING_VERSION = 1.0` e
`CURRENT_PROJECT_VERSION = 1`. O perfil `production` do `eas.json` usa
`autoIncrement: true`, então o EAS cuida do número da build a cada envio. A versão de
marketing (1.0, 1.1…) continua sendo alterada à mão quando fizer sentido.

**Sign in with Apple.** Não é exigido hoje, porque o app não oferece login social — as
bibliotecas nunca foram instaladas. Se um dia ativar o login com Google, a diretriz 4.8
passa a exigir o Sign in with Apple, e aí é preciso habilitar a capability no App ID.

**Não crie certificados em paralelo.** Se você criar um no portal e o EAS criar outro, a
conta atinge o limite de 2 e a próxima build falha pedindo para revogar algum.

---

## A conta Apple pertence a duas organizações

`activeconexautomacoes@gmail.com` é membro de duas empresas, e isso já custou um ciclo de
erro. Os identificadores certos são os da **LPAR**, dona do app:

| | |
|---|---|
| Team ID (LPAR) | `Z7U2XD3LS9` |
| ASC App ID (o app) | `6806420106` |
| Provider ID (LPAR) | `129362518` |
| Team ID da PLUS MIDIA — **não usar** | `49K4553QTR` |

O `49K4553QTR` apareceu no portal da Apple porque a PLUS MIDIA estava selecionada no
seletor de organização, e acabou copiado para o `eas.json` e para o projeto Xcode.

O `eas submit` guarda a organização escolhida em
`~/.app-store/auth/<apple-id>/cookie` e a **restaura sem perguntar** nas execuções
seguintes — nem `FASTLANE_ITC_TEAM_NAME` sobrescreve. Se ele insistir na organização
errada, apague a sessão:

```bash
rm -rf ~/.app-store/auth/activeconexautomacoes@gmail.com
```

A solução definitiva é a **App Store Connect API Key**: a chave pertence a uma única
organização, então não há prompt de provider nem sessão em cache para dar errado.

**Já está resolvido.** No primeiro envio bem-sucedido o EAS gerou a chave
`[Expo] EAS Submit X7HfhSAupO` (Key ID `KAJQK8C598`), guardada nos servidores dele e
vinculada ao app. Com ela mais o `ascAppId` no `eas.json`, os próximos envios não pedem
senha, não pedem código de dois fatores e não passam pela escolha de provider.

---

## Rejeição da primeira entrega (build 1)

A Apple recusou o binário com três avisos. Dois foram corrigidos no repositório; o
terceiro depende de arte que não existe no projeto.

**ITMS-90713 — `CFBundleIconName` ausente** ✅ corrigido. A chave é obrigatória desde o
SDK do iOS 11 e não vinha no `Info.plist` do template.

**ITMS-90725 — SDK antigo** ✅ corrigido. A build saiu com o SDK do iOS 18.2; a Apple
passou a exigir o do iOS 26. O `eas.json` agora pede `"image": "latest"` nos perfis
`preview` e `production`, o que usa a imagem de build mais recente da Expo.

**ITMS-90022 — ícone de 120×120 ausente** ⚠️ **depende de você.** O
`AppIcon.appiconset` contém apenas o `Contents.json`: nenhuma imagem. É o padrão do
template do React Native, que declara as vagas e não fornece arte.

Não dá para aproveitar o ícone do Android: o maior é 192×192 (pequeno demais para o
1024×1024 da App Store), tem canal alfa — proibido em ícone iOS — e além disso é o
robozinho padrão do template, não a marca do CalorIA.

### O que fornecer

Um PNG de **1024×1024**, **sem canal alfa** e **sem cantos arredondados** (o iOS aplica a
máscara sozinho). A partir dele todos os tamanhos menores são gerados automaticamente.

O mesmo arquivo resolve de quebra o ícone do Android, que hoje está publicado na Play
Store com o robô do template no lançador do celular.
