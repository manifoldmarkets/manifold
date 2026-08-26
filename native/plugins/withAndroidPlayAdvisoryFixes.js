const fs = require('fs')
const path = require('path')
const {
  createRunOncePlugin,
  withAndroidManifest,
  withFinalizedMod,
} = require('@expo/config-plugins')

/**
 * @typedef {import('@expo/config-plugins').ConfigPlugin} ConfigPlugin
 */

/**
 * Fix the two Google Play advisories that prebuild otherwise re-introduces on
 * every build (the build scripts run a non-clean `expo prebuild`, so editing
 * the checked-in android project alone is not enough):
 *
 * 1. "Remove resizability and orientation restrictions": strip
 *    `android:screenOrientation` from MainActivity. Android 16+ ignores
 *    manifest orientation locks on >=600dp displays anyway; phones are kept
 *    portrait at runtime in MainActivity.onCreate, which the system likewise
 *    ignores on large screens — so tablets and foldables stay rotatable.
 *
 * 2. "Uses deprecated APIs or parameters for edge-to-edge": strip
 *    `android:statusBarColor` from AppTheme. It is deprecated and a no-op
 *    under edge-to-edge, but prebuild re-injects it from
 *    `splash.backgroundColor` via @expo/prebuild-config's splash plugin.
 *    That injection runs after regular user mods (a withAndroidStyles mod
 *    here loses the race — verified empirically), so the strip has to happen
 *    in the `finalized` mod, which runs after everything else.
 *
 * @type {ConfigPlugin}
 */
const withAndroidPlayAdvisoryFixes = (config) => {
  config = withAndroidManifest(config, (config) => {
    for (const application of config.modResults.manifest.application || []) {
      for (const activity of application.activity || []) {
        if (activity.$?.['android:name'] === '.MainActivity') {
          delete activity.$['android:screenOrientation']
        }
      }
    }
    return config
  })

  config = withFinalizedMod(config, [
    'android',
    async (config) => {
      const stylesPath = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'values',
        'styles.xml'
      )
      const contents = await fs.promises.readFile(stylesPath, 'utf8')
      const stripped = contents
        .split('\n')
        .filter((line) => !line.includes('name="android:statusBarColor"'))
        .join('\n')
      if (stripped !== contents) {
        await fs.promises.writeFile(stylesPath, stripped)
      }
      return config
    },
  ])

  return config
}

module.exports = createRunOncePlugin(
  withAndroidPlayAdvisoryFixes,
  'withAndroidPlayAdvisoryFixes',
  '1.0.0'
)
