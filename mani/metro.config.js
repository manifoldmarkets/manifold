// Learn more https://docs.expo.io/guides/customizing-metro
const { getSentryExpoConfig } = require('@sentry/react-native/metro')

const path = require('path')
const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '..')
const defaultConfig = getSentryExpoConfig(projectRoot)

// Explicitly list all shared dependencies
const extraNodeModules = {
  // Workspace modules
  common: path.resolve(workspaceRoot, 'common/src'),
  'client-common': path.resolve(workspaceRoot, 'client-common/src'),

  // Local modules
  hooks: path.resolve(projectRoot, 'hooks'),
  components: path.resolve(projectRoot, 'components'),
  lib: path.resolve(projectRoot, 'lib'),
  constants: path.resolve(projectRoot, 'constants'),

  // Core dependencies - ensure single copy
  react: path.resolve(projectRoot, 'node_modules/react'),
  'react-native': path.resolve(projectRoot, 'node_modules/react-native'),

  // Other shared dependencies from common/client-common
  firebase: path.resolve(projectRoot, 'node_modules/firebase'),
  dayjs: path.resolve(projectRoot, 'node_modules/dayjs'),
}

module.exports = {
  ...defaultConfig,
  watchFolders: [
    ...defaultConfig.watchFolders,
    path.resolve(workspaceRoot, 'common/src'),
    path.resolve(workspaceRoot, 'client-common/src'),
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
    extraNodeModules,
    assetExts: [...defaultConfig.resolver.assetExts, 'cjs'],
    sourceExts: [...defaultConfig.resolver.sourceExts, 'cjs'],
  },
}
