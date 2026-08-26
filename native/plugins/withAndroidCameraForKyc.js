const {
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
 * react-native-webview handles that in `RNCWebChromeClient.onPermissionRequest`
 * by mapping RESOURCE_VIDEO_CAPTURE -> Manifest.permission.CAMERA and calling
 * `requestPermissions`. If the app never declares CAMERA, Android denies it
 * *without showing a dialog*, the webview calls `request.deny()`, and
 * getUserMedia rejects — so the user gets a dead camera and is never prompted.
 *
 * iOS is unaffected: NSCameraUsageDescription is declared and
 * react-native-webview defaults `mediaCapturePermissionGrantStatus` to prompt.
 *
 * This lives in a config plugin rather than `android.permissions` in
 * app.config.js + a hand-edit for the <uses-feature> tags, so that the whole
 * fix is in one place and survives both the non-clean `expo prebuild` the build
 * scripts run and a `prebuild --clean`.
 *
 * @type {ConfigPlugin}
 */
const withAndroidCameraForKyc = (config) => {
  return withAndroidManifest(config, (config) => {
    const { manifest } = config.modResults

    manifest['uses-permission'] = manifest['uses-permission'] || []
    if (
      !manifest['uses-permission'].some(
        (p) => p.$?.['android:name'] === CAMERA_PERMISSION
      )
    ) {
      manifest['uses-permission'].push({
        $: { 'android:name': CAMERA_PERMISSION },
      })
    }

    manifest['uses-feature'] = manifest['uses-feature'] || []
    for (const name of OPTIONAL_FEATURES) {
      if (
        !manifest['uses-feature'].some((f) => f.$?.['android:name'] === name)
      ) {
        manifest['uses-feature'].push({
          $: { 'android:name': name, 'android:required': 'false' },
        })
      }
    }

    return config
  })
}

module.exports = createRunOncePlugin(
  withAndroidCameraForKyc,
  'withAndroidCameraForKyc',
  '1.0.0'
)
