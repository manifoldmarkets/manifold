// Learn more https://docs.expo.io/guides/customizing-metro
const { getSentryExpoConfig } = require('@sentry/react-native/metro')

/**
 * Metro configuration for React Native
 * https://github.com/facebook/react-native
 *
 * @format
 */
const path = require('path')
const projectRoot = __dirname
const defaultConfig = getSentryExpoConfig(projectRoot)

const extraNodeModules = {
  common: path.resolve(__dirname + '/../common/src'),
  hooks: __dirname + '/hooks',
  components: path.resolve(__dirname + '/components'),
  lib: path.resolve(__dirname + '/lib'),
  constants: __dirname + '/constants',
  assets: path.resolve(__dirname + '/assets'),
}
module.exports = {
  ...defaultConfig,
  watchFolders: [
    ...defaultConfig.watchFolders,
    path.resolve(__dirname + '/../common/src'),
  ],
  transformer: {
    ...defaultConfig.transformer,
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: false,
      },
    }),
  },
  resolver: {
    ...defaultConfig.resolver,
    nodeModulesPaths: [path.resolve(projectRoot, 'node_modules')],
    extraNodeModules: new Proxy(extraNodeModules, {
      get: (target, name) =>
        //redirects dependencies referenced from common/ to local node_modules
        name in target
          ? target[name]
          : path.join(process.cwd(), `node_modules/${name}`),
    }),
    assetExts: [...defaultConfig.resolver.assetExts, 'cjs'],
    sourceExts: [...defaultConfig.resolver.sourceExts, 'cjs'],
  },
}
