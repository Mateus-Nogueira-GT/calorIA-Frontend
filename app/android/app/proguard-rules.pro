# Keep rules do CalorIA — manter o MÍNIMO: as libs RN modernas trazem
# consumer rules nos próprios AARs. Só adicionar regra nova aqui se o
# smoke test de release crashar (diagnóstico via adb logcat).

# Hermes: acesso via JNI a classes que o R8 não enxerga como usadas.
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }
