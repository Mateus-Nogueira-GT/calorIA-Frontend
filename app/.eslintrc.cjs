module.exports = {
  root: true,
  // scripts/ é ferramental Node (CommonJS), roda fora do bundle do app e não
  // segue as regras de React Native/TS aplicadas a src/.
  ignorePatterns: ['scripts/'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 2021,
    sourceType: 'module',
  },
  extends: [
    '@react-native',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-native/all',
    'prettier',
  ],
  plugins: ['@typescript-eslint', 'react-native'],
  rules: {
    'react-native/sort-styles': 'off',
  },
  env: {
    'react-native/react-native': true,
  },
};
