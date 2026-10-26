# Arquivos de verificação de domínio

Copiados para `web/dist/.well-known/` pelo `scripts/copy-well-known.js` no `build:web`.

- `apple-app-site-association`: Universal Links (iOS).
- `assetlinks.json`: App Links (Android).

`assetlinks.json` lista duas impressões SHA-256: a da chave de assinatura do EAS
(builds instalados fora da loja) e a da Assinatura de apps do Google Play (builds
baixados da loja). Se a chave da Play mudar, troque a segunda — onde achar: Play
Console → Integridade do app → Assinatura de apps → Certificado da chave de
assinatura do app.
