// Learn more https://docs.expo.io/guides/customizing-metro
const { getSentryExpoConfig } = require('@sentry/react-native/metro')

const path = require('path')
const projectRoot = __dirname
const defaultConfig = getSentryExpoConfig(projectRoot)
const workspaceRoot = path.resolve(__dirname, '..')

// Core shared dependencies to ensure single copy
const extraNodeModules = {
  // Workspace modules
  common: path.resolve(workspaceRoot, 'common/src'),
  'client-common': path.resolve(workspaceRoot, 'client-common/src'),
  // Core dependencies - ensure single copy
  ...Object.fromEntries(
    ['react', 'react-native', 'firebase', 'dayjs'].map((pkg) => [
      pkg,
      path.resolve(projectRoot, `node_modules/${pkg}`),
    ])
  ),

  // Auto-map all subdirectories for easy imports
  ...getSubdirectoryModules(projectRoot),
}

// Helper to automatically map all subdirectories
function getSubdirectoryModules(root) {
  const fs = require('fs')
  const directories = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .filter(
      (dirent) =>
        !dirent.name.startsWith('.') &&
        !['node_modules', 'android', 'ios'].includes(dirent.name)
    )

  return Object.fromEntries(
    directories.map((dirent) => [dirent.name, path.resolve(root, dirent.name)])
  )
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
    nodeModulesPaths: [path.resolve(projectRoot, 'node_modules')],
    extraNodeModules,
    assetExts: [...defaultConfig.resolver.assetExts, 'cjs'],
    sourceExts: [...defaultConfig.resolver.sourceExts, 'cjs'],
  },
}
