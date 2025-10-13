export default ({ config }) => {
  const otaUpdateVersion = '1.0.0'

  return {
    expo: {
      name: 'Manifold',
      slug: 'manifold-markets',
      owner: 'iansp',
      scheme: 'com.markets.manifold',
      newArchEnabled: true,
      jsEngine: 'hermes',
      version: '2.0.70',
      orientation: 'portrait',
      icon: './assets/logo.png',
      userInterfaceStyle: 'light',
      plugins: [
        './plugins/withAndroidVerifiedLinksWorkaround',
        'expo-font',
        [
          'expo-notifications',
          {
            icon: './assets/manifold_white_transparent.png',
            color: '#4337C9',
            defaultChannel: 'default',
          },
        ],
        [
          '@sentry/react-native/expo',
          {
            organization: 'manifold-markets',
            project: 'react-native',
            url: 'https://sentry.io/',
          },
        ],
        ['expo-web-browser'],
        ['expo-apple-authentication'],
      ],
      splash: {
        image: './assets/splash.png',
        resizeMode: 'cover',
        backgroundColor: '#4337C9',
      },
      web: {
        favicon: './assets/favicon.png',
      },
      platforms: ['ios', 'android'],
      updates: {
        fallbackToCacheTimeout: 0,
        url: 'https://u.expo.dev/0ce454fc-3885-4eab-88b6-787b1691973b',
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
        edgeToEdgeEnabled: true,
        googleServicesFile: './google-services.json',
        adaptiveIcon: {
          foregroundImage: './assets/adaptive-icon.png',
          backgroundColor: '#4337C9',
        },
        package: 'com.markets.manifold',
        versionCode: 70,
        runtimeVersion: otaUpdateVersion,
      },
      ios: {
        infoPlist: {
          NSCameraUsageDescription:
            'Pictures can be attached to the content you create.',
          ITSAppUsesNonExemptEncryption: false,
        },
        supportsTablet: true,
        usesAppleSignIn: true,
        bundleIdentifier: 'com.markets.manifold',
        associatedDomains: [
          'applinks:manifold.markets',
          'webcredentials:manifold.markets',
        ],
        buildNumber: '1.0.70',
        runtimeVersion: otaUpdateVersion,
      },
      runtimeVersion: otaUpdateVersion,
      extra: {
        ...config?.extra,
        eas: {
          ...config?.extra?.eas,
          projectId: '0ce454fc-3885-4eab-88b6-787b1691973b',
          NATIVE_BUILD_TYPE: process.env.NATIVE_BUILD_TYPE,
          NEXT_PUBLIC_FIREBASE_ENV: process.env.NEXT_PUBLIC_FIREBASE_ENV,
        },
      },
    },
  }
}
