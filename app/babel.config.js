module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // O webpack (web) declara este plugin no próprio config; o Metro (iOS/Android)
    // usa ESTE arquivo — sem ele, `import ... from '@env'` não resolve e o bundle
    // nativo nem carrega (o app não abria em device/simulador).
    [
      'module:react-native-dotenv',
      {
        moduleName: '@env',
        path: '.env',
        safe: false,
        allowUndefined: true,
      },
    ],
    [
      'module-resolver',
      {
        root: ['./src'],
        extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json', '.node'],
        alias: {
          '@features': './src/features',
          '@shared': './src/shared',
          '@navigation': './src/navigation',
          '@theme': './src/theme',
        },
      },
    ],
  ],
  // O Metro compila com env 'production' quando --dev false (build de release):
  // console.log/debug/info saem do bundle; error/warn ficam — o AppErrorBoundary
  // usa console.error e removê-lo cegaria o diagnóstico local via logcat.
  env: {
    production: {
      plugins: [['transform-remove-console', { exclude: ['error', 'warn'] }]],
    },
  },
};
