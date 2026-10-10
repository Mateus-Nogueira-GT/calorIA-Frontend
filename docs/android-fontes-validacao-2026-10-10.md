# Fontes Android — validação

Data: 2026-10-10. As cinco cópias nativas Inter eram HTML; a origem `app/assets/fonts/` já continha TTF válidos.

## Correção e gate

Copiados explicitamente Regular, Medium, SemiBold, Bold e ExtraBold para `app/android/app/src/main/assets/fonts/`, com atualização dos SHA-1 no manifest existente. Licença OFL e assets iOS/web preservados.

```sh
cd app
npm run verify:android-fonts
# Opcional: depois de extrair base/assets/fonts de um AAB:
node scripts/verify-android-fonts.js /caminho/das/fontes-extraidas
```

O script verifica assinatura TrueType, diretório/tabelas obrigatórias e seus limites, igualdade byte a byte com a origem e manifest no modo padrão. O CI executa esse gate antes de typecheck/test/bundle. A versão antiga falhou com `não é uma fonte TrueType válida`; as cinco fontes corrigidas passam. A ferramenta `file` identifica as cópias como TrueType. FontTools leu as cinco fontes (2933 glyphs cada) e confirmou as famílias Inter/Inter-Medium/Inter-SemiBold/Inter-Bold/Inter-ExtraBold.

## Artefato e limites

Build local de validação utiliza Gradle release com configuração temporária externa que remove assinatura, sem alterar signing no repositório. A configuração local contém apenas a URL pública da API e timeout. O AAB resultante é exclusivamente para inspeção e não deve ser enviado à loja.

Os testes completos (478 / 78 suites), typecheck, build web e bundle Android de release passaram também na revisão que contém o gate. Revisões de Standards e Correção das fontes não encontraram defeitos adicionais. O resultado e a inspeção do AAB serão registrados abaixo após conclusão. Não há evidência de EAS assinado, smoke em APK, aprovação ou rollout Play para esta correção.

A alteração de assets é nativa e precisa de novo build com versionCode maior e runtime/fingerprint verificados. OTA não substitui as fontes empacotadas. Recuperação exige novo build contendo assets corretos; verificar track, aprovação e rollout antes de declarar produção concluída.
