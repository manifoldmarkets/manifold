const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withAndroidStyles,
  withMainActivity,
} = require('@expo/config-plugins')
const { addImports } = require('@expo/config-plugins/build/android/codeMod')
const {
  mergeContents,
} = require('@expo/config-plugins/build/utils/generateCode')

/**
 * @typedef {import('@expo/config-plugins').ConfigPlugin} ConfigPlugin
 */

const STATUS_BAR_COLOR = 'android:statusBarColor'

// Kotlin generated into MainActivity.kt. Phones (compact width) stay portrait;
// tablets and foldables (smallest width >= 600dp) rotate freely, which is what
// Play's large-screen advisory asks for and what Android 16+ enforces anyway.
// Re-applied on configuration changes so a foldable that crosses the threshold
// picks up the right policy.
const ORIENTATION_LOCK_METHODS = `  private fun applyPhoneOrientationLock() {
    requestedOrientation =
      if (resources.configuration.smallestScreenWidthDp < 600)
        ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
      else
        ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    applyPhoneOrientationLock()
  }
`
const ORIENTATION_LOCK_CALL = '    applyPhoneOrientationLock()'

/**
 * Fix the two Google Play advisories that prebuild otherwise re-introduces on
 * every build (the build scripts run a non-clean `expo prebuild`, so editing
 * the checked-in android project alone is not enough):
 *
 * 1. "Remove resizability and orientation restrictions": strip
 *    `android:screenOrientation` from MainActivity (prebuild writes it from
 *    `orientation: 'portrait'`, which stays in app.config.js for iOS's sake)
 *    and lock phones to portrait at runtime instead, via a generated block in
 *    MainActivity.kt. Generating it (rather than hand-editing the file) is what
 *    makes it survive `prebuild --clean`, which rewrites MainActivity.kt from
 *    Expo's template.
 *
 * 2. "Uses deprecated APIs or parameters for edge-to-edge": strip
 *    `android:statusBarColor` from AppTheme. It is deprecated and a no-op under
 *    edge-to-edge, but prebuild re-injects it: the splash plugin copies
 *    `splash.backgroundColor` into `androidStatusBar.backgroundColor`, and the
 *    default status-bar mod writes that into styles.xml. User plugin mods run
 *    after the default ones, so this styles mod sees the item and removes it.
 *
 * @type {ConfigPlugin}
 */
const withAndroidPlayAdvisoryFixes = (config) => {
  config = withAndroidManifest(config, (config) => {
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(
      config.modResults
    )
    delete mainActivity.$['android:screenOrientation']
    return config
  })

  config = withAndroidStyles(config, (config) => {
    config.modResults = AndroidConfig.Styles.removeStylesItem({
      xml: config.modResults,
      parent: AndroidConfig.Styles.getAppThemeGroup(),
      name: STATUS_BAR_COLOR,
    })
    return config
  })

  config = withMainActivity(config, (config) => {
    const { modResults } = config
    if (modResults.language !== 'kt') {
      throw new Error(
        'withAndroidPlayAdvisoryFixes: MainActivity must be Kotlin (found ' +
          modResults.language +
          ')'
      )
    }
    let contents = addImports(
      modResults.contents,
      ['android.content.pm.ActivityInfo', 'android.content.res.Configuration'],
      false
    )
    contents = mergeContents({
      src: contents,
      newSrc: ORIENTATION_LOCK_METHODS,
      tag: 'manifold-orientation-lock',
      comment: '  //',
      // Right after the class opening line, ahead of onCreate.
      anchor: /^class MainActivity : ReactActivity\(\) \{/,
      offset: 1,
    }).contents
    contents = mergeContents({
      src: contents,
      newSrc: ORIENTATION_LOCK_CALL,
      tag: 'manifold-orientation-lock-init',
      comment: '    //',
      // Inside onCreate, ahead of super.onCreate — the same anchor the splash
      // plugin uses.
      anchor: /super\.onCreate\(null\)/,
      offset: 0,
    }).contents
    return { ...config, modResults: { ...modResults, contents } }
  })

  return config
}

module.exports = createRunOncePlugin(
  withAndroidPlayAdvisoryFixes,
  'withAndroidPlayAdvisoryFixes',
  '1.0.0'
)
