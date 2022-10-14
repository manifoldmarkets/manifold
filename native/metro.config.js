// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config')
const defaultConfig = getDefaultConfig(__dirname)

/**
 * Metro configuration for React Native
 * https://github.com/facebook/react-native
 *
 * @format
 */
const path = require('path')
const extraNodeModules = {
  common: path.resolve(__dirname + '/../common'),
}
const watchFolders = [path.resolve(__dirname + '/../common')]

module.exports = {
  ...defaultConfig,
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: false,
      },
    }),
  },
  resolver: {
    extraNodeModules: new Proxy(extraNodeModules, {
      get: (target, name) =>
        //redirects dependencies referenced from common/ to local node_modules
        name in target
          ? target[name]
          : path.join(process.cwd(), `node_modules/${name}`),
    }),
    assetExts: [...defaultConfig.resolver.assetExts, 'cjs'],
  },
  watchFolders,
}
