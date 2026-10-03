const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
} = require('@expo/config-plugins')

/**
 * @typedef {import('@expo/config-plugins').ConfigPlugin} ConfigPlugin
 */

const CAMERA_PERMISSION = 'android.permission.CAMERA'

// Declaring CAMERA makes Play imply `android.hardware.camera` is *required*,
// which would drop the listing on camera-less devices. Mark both features
// optional to keep distribution unchanged.
const OPTIONAL_FEATURES = [
  'android.hardware.camera',
  'android.hardware.camera.autofocus',
]

/**
 * Grant the webview camera access for the iDenfy KYC flow.
 *
 * Identity verification navigates the webview to iDenfy's hosted page, which
 * captures the ID document and selfie via `navigator.mediaDevices.getUserMedia()`.
 * react-native-webview maps that to the CAMERA runtime permission; if the app
 * never declares it, Android denies it *without showing a dialog* and the user
 * gets a dead camera and is never prompted.
 *
 * iOS is unaffected: NSCameraUsageDescription is declared and
 * react-native-webview defaults `mediaCapturePermissionGrantStatus` to prompt.
 *
 * Kept in one plugin (rather than `android.permissions` + a hand-edit for the
 * <uses-feature> tags) so the whole fix survives both the non-clean
 * `expo prebuild` the build scripts run and a `prebuild --clean`.
 *
 * @type {ConfigPlugin}
 */
const withAndroidCameraForKyc = (config) => {
  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults
    const { manifest } = androidManifest

    AndroidConfig.Permissions.ensurePermission(
      androidManifest,
      CAMERA_PERMISSION
    )
    // Keep the permission list in a stable order so a clean prebuild and the
    // checked-in manifest agree.
    manifest['uses-permission'].sort((a, b) =>
      String(a.$?.['android:name']).localeCompare(String(b.$?.['android:name']))
    )

    const features = manifest['uses-feature'] || []
    for (const name of OPTIONAL_FEATURES) {
      if (!features.some((f) => f.$?.['android:name'] === name)) {
        features.push({
          $: { 'android:name': name, 'android:required': 'false' },
        })
      }
    }
    // The XML writer emits keys in insertion order; place <uses-feature> right
    // after <uses-permission> rather than after </application>, so a clean
    // prebuild produces the same file as the checked-in one.
    const ordered = {}
    for (const key of Object.keys(manifest)) {
      if (key === 'uses-feature') continue
      ordered[key] = manifest[key]
      if (key === 'uses-permission') ordered['uses-feature'] = features
    }
    if (!ordered['uses-feature']) ordered['uses-feature'] = features
    androidManifest.manifest = ordered

    return config
  })
}

module.exports = createRunOncePlugin(
  withAndroidCameraForKyc,
  'withAndroidCameraForKyc',
  '1.0.0'
)
