export default ({ config }) => {
  // BUMP THIS whenever native code changes. This release adds the
  // react-native-android-widget native module, which index.js require()s on
  // Android; that module resolves via TurboModuleRegistry.getEnforcing, which
  // THROWS AT STARTUP if the binary doesn't contain it. Publishing this JS as an
  // OTA on runtime 1.0.0 would therefore crash every existing Android install on
  // launch. A new runtime keeps the widget bundle away from old binaries.
  const otaUpdateVersion = '1.1.0'

  return {
    expo: {
      name: 'Manifold',
      slug: 'manifold-markets',
      // The Expo project moved from Ian's personal account to the org on
      // 2026-08-28. A transfer PRESERVES the project id, so projectId and
      // updates.url below are unchanged and still match what every shipped
      // binary embedded — do not "fix" them to a new id.
      owner: 'manifold-markets',
      scheme: 'com.markets.manifold',
      newArchEnabled: true,
      jsEngine: 'hermes',
      version: '2.1.0',
      // On Android the manifest lock this writes is stripped again by
      // withAndroidPlayAdvisoryFixes; phones stay portrait via MainActivity.
      orientation: 'portrait',
      icon: './assets/logo.png',
      userInterfaceStyle: 'light',
      plugins: [
        './plugins/withAndroidVerifiedLinksWorkaround',
        './plugins/withAndroidPlayAdvisoryFixes',
        './plugins/withAndroidCameraForKyc',
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
                // Re-render every 30 min (the OS minimum) so the widget flips
                // lit -> pending shortly after midnight PT even with the app
                // closed. The headless task recomputes state from the stored
                // snapshot vs. the current time — no network needed.
                updatePeriodMillis: 1800000,
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
        versionCode: 74,
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
        buildNumber: '1.0.72',
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
