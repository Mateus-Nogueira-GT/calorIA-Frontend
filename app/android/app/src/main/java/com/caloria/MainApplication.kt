package com.caloria

import android.app.Application
import android.content.res.Configuration
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.soloader.OpenSourceMergedSoMapping
import com.facebook.soloader.SoLoader
import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory

class MainApplication : Application(), ReactApplication {

  /**
   * O ReactHost vem do Expo (e não do DefaultReactHost do RN) porque é por ele
   * que o expo-updates decide QUAL bundle carregar: o embutido no APK ou o
   * último OTA baixado. Com o DefaultReactHost o app ignoraria os OTAs.
   *
   * Não há mais ReactNativeHost: no RN 0.85 com a New Architecture ele é
   * @Deprecated e a interface ReactApplication lança se alguém o usar. O
   * `install-expo-modules` ainda gerava o ReactNativeHostWrapper, que não
   * existe no Expo SDK 56 — o build quebrava em compileDebugKotlin.
   */
  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
          PackageList(this).packages.apply {
            // Packages that cannot be autolinked yet can be added manually here, for example:
            // add(MyReactNativePackage())
          },
    )
  }

  override fun onCreate() {
    super.onCreate()
    SoLoader.init(this, OpenSourceMergedSoMapping)
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      // If you opted-in for the New Architecture, we load the native entry point for this app.
      load()
    }
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
