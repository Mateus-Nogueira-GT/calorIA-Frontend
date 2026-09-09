package com.caloria

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * O react-native-screens NAO suporta restauracao de estado de fragmentos. Ao
   * recriar a Activity, o Android tenta reinstanciar os fragments de Screen
   * salvos e a biblioteca lanca
   *
   *   IllegalStateException: Screen fragments should never be restored.
   *
   * derrubando o app. Passar `null` para super.onCreate descarta o estado
   * salvo e deixa o React Navigation reconstruir a navegacao — e o
   * procedimento indicado pela propria biblioteca.
   *
   * Sem isso o app CRASHA quando o usuario muda a escala de fonte do sistema
   * ou o idioma do app: `fontScale` e `locale` nao estao (e nao devem estar)
   * em android:configChanges, entao a Activity e recriada com o processo ainda
   * vivo e o estado de fragmentos e restaurado. Reproduzido em emulador
   * Android 16: mudar a fonte do sistema matava o processo do app.
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "calorIA"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
