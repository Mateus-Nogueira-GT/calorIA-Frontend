# Social login no mobile — checklist de ativação

**Estado atual:** as libs nativas **não estão instaladas**. Os guards de
`require` em `google-signin.service.ts` / `apple-signin.service.ts` detectam a
ausência e o app esconde os botões — comportamento correto, sem crash.

O backend já está pronto: `POST /auth/google` e `POST /auth/apple` validam o
token no Supabase e derivam o `username` (`ensureUsername`).

Para ativar, os passos abaixo precisam de credenciais e acesso ao Xcode —
não dá para automatizar pelo repositório.

## 1. Instalar as dependências

```bash
cd app
npm i @react-native-google-signin/google-signin @invertase/react-native-apple-authentication
cd ios && bundle install && bundle exec pod install
```

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
2. Xcode → target `calorIA` → Signing & Capabilities → **+ Sign in with Apple**.
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
