export default ({ config }) => {
  const otaUpdateVersion = '1.0.0'
  // Override to build under your own Expo account (e.g. for a personal test
  // build): set EAS_OWNER, then run `eas init` and set EAS_PROJECT_ID to the
  // new id it prints. When owner is overridden, we DON'T fall back to the
  // shared project id — otherwise `eas init` thinks it's already linked.
  const owner = process.env.EAS_OWNER || 'iansp'
  const isDefaultOwner = owner === 'iansp'
  const projectId =
    process.env.EAS_PROJECT_ID ||
    (isDefaultOwner ? '0ce454fc-3885-4eab-88b6-787b1691973b' : undefined)

  return {
    expo: {
      name: 'Manifold',
      slug: 'manifold-markets',
      owner,
      scheme: 'com.markets.manifold',
      newArchEnabled: true,
      jsEngine: 'hermes',
      version: '2.0.71',
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
        '@bacons/apple-targets',
        // Android home-screen streak widget. One resizable widget that renders a
        // small (≈2x2) or medium (≈4x2) layout based on its size. The render code
        // + headless update task live in native/widgets/. iOS uses a separate
        // SwiftUI target (@bacons/apple-targets) — this is Android-only.
        [
          'react-native-android-widget',
          {
            widgets: [
              {
                name: 'Streak',
                label: 'Manifold Streak',
                description: 'Keep your Manifold streak alive 🔥',
                // Default to 2 wide x 1 tall. Some launchers (e.g. Motorola) have
                // tall grid rows, so 2 rows renders as a huge half-screen tile;
                // one row is a compact ~square. minHeight is the floor on dense
                // grids; min == minResize in this lib, so keep min low enough to
                // let users shrink it.
                minWidth: '110dp',
                minHeight: '90dp',
                targetCellWidth: 2,
                targetCellHeight: 1,
                maxResizeWidth: '320dp',
                maxResizeHeight: '200dp',
                resizeMode: 'horizontal|vertical',
              },
            ],
          },
        ],
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
        ...(projectId ? { url: `https://u.expo.dev/${projectId}` } : {}),
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
        versionCode: 71,
        runtimeVersion: otaUpdateVersion,
      },
      ios: {
        infoPlist: {
          NSCameraUsageDescription:
            'Pictures can be attached to the content you create.',
          ITSAppUsesNonExemptEncryption: false,
        },
        // Shared App Group: the app writes the streak snapshot the widget reads.
        // Must match the widget target's entitlement
        // (targets/widget/expo-target.config.js) and the suiteName in
        // targets/widget/index.swift. Adding this capability triggers a one-time
        // EAS credentials re-provision.
        entitlements: {
          'com.apple.security.application-groups': [
            'group.com.markets.manifold',
          ],
        },
        supportsTablet: true,
        usesAppleSignIn: true,
        bundleIdentifier: 'com.markets.manifold',
        // Needed by @bacons/apple-targets to sign the widget extension target.
        appleTeamId: process.env.APPLE_TEAM_ID || 'RPU7UVLP3Z',
        associatedDomains: [
          'applinks:manifold.markets',
          'webcredentials:manifold.markets',
        ],
        buildNumber: '1.0.71',
        runtimeVersion: otaUpdateVersion,
      },
      runtimeVersion: otaUpdateVersion,
      extra: {
        ...config?.extra,
        eas: {
          ...config?.extra?.eas,
          projectId,
          NATIVE_BUILD_TYPE: process.env.NATIVE_BUILD_TYPE,
          NEXT_PUBLIC_FIREBASE_ENV: process.env.NEXT_PUBLIC_FIREBASE_ENV,
        },
      },
    },
  }
}
