# Arquivos de verificação de domínio

Copiados para `web/dist/.well-known/` pelo `scripts/copy-well-known.js` no `build:web`.

- `apple-app-site-association`: Universal Links (iOS).
- `assetlinks.json`: App Links (Android).

Pendência antes do build de loja: `assetlinks.json` só tem o SHA-256 da chave de
assinatura do EAS. Acrescente o SHA-256 da Assinatura de apps do Google Play em
`sha256_cert_fingerprints` (JSON não aceita comentários). Onde achar: Play Console
→ Integridade do app → Assinatura de apps.
