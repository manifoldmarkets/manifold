module.exports = {
  name: 'Manifold',
  slug: 'manifold-markets',
  owner: 'iansp',
  version: '2.0.3',
  orientation: 'portrait',
  icon: './assets/logo.png',
  userInterfaceStyle: 'light',
  plugins: ['./plugins/withAndroidVerifiedLinksWorkaround', 'sentry-expo'],
  splash: {
    image: './assets/splash.png',
    resizeMode: 'cover',
    backgroundColor: '#4337C9',
  },
  updates: {
    fallbackToCacheTimeout: 0,
    url: 'https://u.expo.dev/0ce454fc-3885-4eab-88b6-787b1691973b',
  },
  runtimeVersion: {
    policy: 'sdkVersion',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.markets.manifold',
    buildNumber: '1.0.1',
  },
  android: {
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          {
            scheme: 'https',
            host: 'manifold.markets',
          },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
    useNextNotificationsApi: true,
    googleServicesFile: './google-services.json',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#4337C9',
    },
    package: 'com.markets.manifold',
    versionCode: 11,
  },
  web: {
    favicon: './assets/favicon.png',
  },
  extra: {
    eas: {
      projectId: '0ce454fc-3885-4eab-88b6-787b1691973b',
    },
  },
  hooks: {
    postPublish: [
      {
        file: 'sentry-expo/upload-sourcemaps',
        config: {
          organization: 'manifold-markets',
          project: 'react-native',
          authToken: process.env.SENTRY_AUTH_TOKEN,
        },
      },
    ],
  },
}
