/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'widget',
  name: 'StreakWidget',
  displayName: 'Streak',
  // iOS 17+: uses the modern `.containerBackground(for: .widget)` API.
  // (Lock-screen accessories are iOS 16+, but 17 is the floor for the bg API.)
  deploymentTarget: '17.0',
  frameworks: ['SwiftUI', 'WidgetKit'],
  // No JS in the widget; pure SwiftUI.
  exportJs: false,
  // Generates Assets.xcassets/ManifoldLogo.imageset → usable as Image("ManifoldLogo").
  // White origami crane on transparent bg (the Manifold mark).
  images: {
    // White crane on transparent — used on home widgets and the lock screen.
    ManifoldLogo: './manifold-logo.png',
  },
  // Shared App Group: the RN app writes the streak snapshot here and the widget
  // reads it. Must match the entitlement on the app target (app.config.js) and
  // the suiteName the Swift Provider opens (index.swift).
  entitlements: {
    'com.apple.security.application-groups': ['group.com.markets.manifold'],
  },
}
