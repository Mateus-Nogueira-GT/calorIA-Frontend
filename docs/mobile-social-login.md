# Social login no mobile — checklist de ativação

**Estado atual:** as libs nativas **estão instaladas** e o entitlement de
Sign in with Apple está no projeto iOS. O que falta são credenciais e passos
em consoles externos — nada disso dá para automatizar pelo repositório.

O backend já está pronto: `POST /auth/google` e `POST /auth/apple` validam o
token no Supabase e derivam o `username` (`ensureUsername`).

Enquanto o `GOOGLE_WEB_CLIENT_ID` não estiver no `.env`, o botão do Google
aparece mas falha com mensagem apontando para este documento. O da Apple
depende da capability no portal (ver abaixo).

## 1. Dependências — FEITO

```
@react-native-google-signin/google-signin  ^16.1.5
@invertase/react-native-apple-authentication ^2.5.1
```

Falta rodar, numa máquina com Xcode:

```bash
cd app/ios && bundle install && bundle exec pod install
```

> A v13 da lib do Google mudou o retorno de `signIn()` de `{ idToken }` para
> `{ type: 'success', data: { idToken } }`. O serviço já foi ajustado para a
> forma nova e `extractIdToken` tem teste travando a regressão — inclusive um
> caso que rejeita explicitamente a forma antiga.

## 2. Google

1. Google Cloud Console (ou Firebase) → criar credenciais OAuth 2.0:
   - **Web client** (é o ID que o app usa: `webClientId`)
   - **iOS client** e **Android client** (SHA-1 do keystore de debug e release)
2. Copiar o **Web client ID** para o `.env` do app:
   ```bash
   GOOGLE_WEB_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
   ```
3. Se usar Firebase: baixar `google-services.json` → `app/android/app/` e
   `GoogleService-Info.plist` → `app/ios/calorIA/`.
4. iOS: adicionar o `REVERSED_CLIENT_ID` como URL scheme no `Info.plist`
   (o arquivo já tem um bloco `CFBundleURLTypes` com o scheme `caloria` —
   basta acrescentar outro `<dict>` no mesmo array).
5. Supabase → Authentication → Providers → Google: habilitar e informar o
   client ID/secret (é o Supabase que valida o `id_token` recebido).

## 3. Apple

1. Apple Developer → App ID com a capability **Sign in with Apple**.
   ⚠️ Sem este passo a **assinatura de código falha**: o arquivo
   `app/ios/calorIA/calorIA.entitlements` já declara
   `com.apple.developer.applesignin`, e o provisioning profile precisa
   suportá-lo.
2. Xcode → target `calorIA` → Signing & Capabilities: a capability já vem do
   entitlements versionado; basta conferir que aparece marcada.
3. Supabase → Authentication → Providers → Apple: habilitar com Service ID,
   Team ID, Key ID e a chave `.p8`.

> ⚠️ **App Store guideline 4.8:** se o app oferece login com Google (ou
> qualquer login social de terceiros), o **Sign in with Apple é obrigatório**
> para a aprovação na App Store. Ativar os dois juntos.

## 4. Verificar

- Sem `GOOGLE_WEB_CLIENT_ID`, o serviço falha com mensagem clara apontando
  para este documento (em vez do erro interno da lib).
- Com tudo configurado: login → o backend responde com sessão e o perfil
  ganha `username` derivado do email.
