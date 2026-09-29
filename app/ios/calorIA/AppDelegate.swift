internal import Expo
import React
import ReactAppDependencyProvider

/**
 * AppDelegate no formato do Expo SDK 56 (template expo-template-bare-minimum).
 *
 * Era um RCTAppDelegate em Objective-C (AppDelegate.h/.mm + main.m). O
 * expo-updates só consegue trocar o bundle embutido pelo último OTA baixado se
 * o React Native for criado pela ExpoReactNativeFactory — com o RCTAppDelegate
 * o app abriria sempre o bundle da loja e ignoraria os OTAs. O
 * `install-expo-modules` ainda gerava EXAppDelegateWrapper, que não existe no
 * SDK 56: o build do iOS quebraria.
 */
@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    // OBRIGATÓRIO a partir do RN 0.85: a nova arquitetura é forçada e o
    // RCTReactNativeFactory lança exceção se o dependencyProvider for nil ao
    // instanciar qualquer TurboModule autolinkado — screens, safe-area-context,
    // async-storage, image-picker. Sem esta linha o app COMPILA e morre ao abrir.
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      // Tem de bater com app.json "name" e com o AppRegistry.registerComponent
      // do index.js. O template do Expo usa "main"; este app sempre foi "calorIA".
      withModuleName: "calorIA",
      in: window,
      launchOptions: launchOptions)

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // Deep links caloria:// (convite de desafio, post, reset de senha). O
  // Info.plist declara o esquema; sem este handler o link abria o app e o
  // RootNavigator nunca recebia a URL.
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
