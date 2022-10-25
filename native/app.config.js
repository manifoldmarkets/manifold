export default ({ config }) => ({
  ...config,
  version: '2.0.4',
  orientation: 'portrait',
  icon: './assets/logo.png',
  userInterfaceStyle: 'light',
  plugins: ['./plugins/withAndroidVerifiedLinksWorkaround', 'sentry-expo'],
  splash: {
    image: './assets/splash.png',
    resizeMode: 'cover',
    backgroundColor: '#4337C9',
  },
  assetBundlePatterns: ['**/*'],
  web: {
    favicon: './assets/favicon.png',
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
})
