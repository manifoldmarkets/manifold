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
  // NOTE: no App Group entitlement yet — this first build renders hardcoded
  // demo data so we can ship to-device fast. Real streak data (read from a
  // shared App Group container) is a follow-up.
}
