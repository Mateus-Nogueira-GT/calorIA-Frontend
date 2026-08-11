# Keep rules do CalorIA — manter o MÍNIMO. Quem protege as libs autolinkadas
# não são elas mesmas (image-picker/screens/safe-area-context/async-storage
# NÃO trazem consumer rules), e sim as regras genéricas do AAR do react-android:
# @DoNotStrip, `implements NativeModule` e `native <methods>`.
# Lib nova que use reflection própria PRECISA de regra explícita aqui.
# Só adicionar regra se o smoke test de release crashar (diagnóstico via adb logcat).

# Hermes: acesso via JNI a classes que o R8 não enxerga como usadas.
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }
