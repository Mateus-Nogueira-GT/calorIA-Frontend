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

Os testes completos (478 / 78 suites), typecheck, build web e bundle Android de release passaram também na revisão que contém o gate. Revisões de Standards e Correção das fontes não encontraram defeitos adicionais. O build Gradle release local passou. A inspeção confirmou cinco TTF idênticos à origem em `base/assets/fonts/`, 64 bibliotecas nas quatro ABIs e 32 ELF de 64 bits: os 98 segmentos LOAD têm `p_align >= 16384`. O mapping está em `BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map`. Ausência de assinatura confirmada. Isso não verifica o alinhamento ZIP de APK nem substitui teste em Android real. Não há evidência de EAS assinado, smoke em APK, aprovação ou rollout Play para esta correção.

A alteração de assets é nativa e precisa de novo build com versionCode maior e runtime/fingerprint verificados. OTA não substitui as fontes empacotadas. Recuperação exige novo build contendo assets corretos; verificar track, aprovação e rollout antes de declarar produção concluída.


## Reprodução do build local

O init script temporário `/tmp/caloria-unsigned-validation.gradle` aplica apenas para esta execução:

```groovy
gradle.beforeProject { project ->
  if (project.name == 'app') {
    project.afterEvaluate {
      project.android.buildTypes.release.signingConfig = null
    }
  }
}
```

Com Android SDK/NDK instalados e Java 17, executar em `app/android/`:

```sh
./gradlew -Dorg.gradle.jvmargs='-Xmx4g -XX:MaxMetaspaceSize=1g' -I /tmp/caloria-unsigned-validation.gradle bundleRelease --console=plain
```

Saída: `app/android/app/build/outputs/bundle/release/app-release.aab` (unsigned, somente inspeção). Logs auxiliares em `/tmp/caloria-fix-native.log` e `/tmp/caloria-fix-native-final.log`. A recompilação incremental inclui o guard final de preparação nativa. Nenhum arquivo de signing do repositório foi alterado.

AAB final: SHA-256 `9feeb6951473c6a5836e23faca2e5a69c420d4c3ad36dd4deb8244392867e903`, 54049160 bytes. Build incremental aprovado em 1m40s (41 tarefas executadas, 667 reaproveitadas). Gate aplicado às fontes extraídas: aprovado.
