const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const appDirectory = path.resolve(__dirname, '..');

const babelLoaderConfig = {
  test: /\.(js|jsx|ts|tsx)$/,
  include: [
    path.resolve(appDirectory, 'index.js'),
    path.resolve(appDirectory, 'App.tsx'),
    path.resolve(appDirectory, 'src'),
    path.resolve(appDirectory, 'node_modules/react-native'),
    path.resolve(appDirectory, 'node_modules/react-native-web'),
    path.resolve(appDirectory, 'node_modules/@react-navigation'),
    path.resolve(appDirectory, 'node_modules/@react-native'),
    path.resolve(appDirectory, 'node_modules/react-native-safe-area-context'),
    path.resolve(appDirectory, 'node_modules/react-native-screens'),
  ],
  use: {
    loader: 'babel-loader',
    options: {
      cacheDirectory: true,
      presets: ['module:@react-native/babel-preset'],
      plugins: [
        [
          'module-resolver',
          {
            alias: {
              '@features': path.resolve(appDirectory, 'src/features'),
              '@shared': path.resolve(appDirectory, 'src/shared'),
              '@navigation': path.resolve(appDirectory, 'src/navigation'),
              '@theme': path.resolve(appDirectory, 'src/theme'),
              'react-native': 'react-native-web',
            },
          },
        ],
        [
          'module:react-native-dotenv',
          {
            moduleName: '@env',
            path: path.resolve(appDirectory, '.env'),
            safe: false,
            allowUndefined: true,
          },
        ],
      ],
    },
  },
};

module.exports = {
  entry: path.resolve(appDirectory, 'index.js'),
  output: {
    path: path.resolve(appDirectory, 'web/dist'),
    filename: 'bundle.[contenthash].js',
    publicPath: '/',
    clean: true,
  },
  resolve: {
    alias: {
      'react-native$': 'react-native-web',
      '@features': path.resolve(appDirectory, 'src/features'),
      '@shared': path.resolve(appDirectory, 'src/shared'),
      '@navigation': path.resolve(appDirectory, 'src/navigation'),
      '@theme': path.resolve(appDirectory, 'src/theme'),
      '@react-native-google-signin/google-signin': path.resolve(appDirectory, 'web/stubs/google-signin.js'),
    },
    extensions: [
      '.web.tsx',
      '.web.ts',
      '.web.js',
      '.tsx',
      '.ts',
      '.js',
    ],
  },
  module: {
    rules: [
      babelLoaderConfig,
      {
        test: /\.(png|jpe?g|gif|svg|webp)$/i,
        type: 'asset/resource',
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/i,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, 'index.html'),
    }),
  ],
  devServer: {
    port: 3000,
    hot: true,
    historyApiFallback: true,
    open: false,
  },
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  devtool: process.env.NODE_ENV === 'production' ? false : 'cheap-module-source-map',
};
