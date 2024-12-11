const {
  createRunOncePlugin,
  withAndroidManifest,
} = require('@expo/config-plugins')

/**
 * @typedef {import('@expo/config-plugins').ConfigPlugin} ConfigPlugin
 * @typedef {import('@expo/config-plugins').AndroidManifest} AndroidManifest
 */

/**
 * Remove the custom Expo dev client scheme from intent filters, which are set to `autoVerify=true`.
 * The custom scheme `<data android:scheme="exp+<slug>"/>` seems to block verification for these intent filters.
 * This plugin makes sure there is no scheme in the autoVerify intent filters, that starts with `exp+`.
 *
 * @type {ConfigPlugin}
 */
const withAndroidVerifiedLinksWorkaround = (config) =>
  withAndroidManifest(config, (config) => {
    config.modResults = removeExpoSchemaFromVerifiedIntentFilters(
      config.modResults
    )
    return config
  })

/**
 * Iterate over all `autoVerify=true` intent filters, and pull out schemes starting with `exp+`.
 *
 * @param {AndroidManifest} androidManifest
 */
function removeExpoSchemaFromVerifiedIntentFilters(androidManifest) {
  for (const application of androidManifest.manifest.application || []) {
    for (const activity of application.activity || []) {
      if (activityHasSingleTaskLaunchMode(activity)) {
        for (const intentFilter of activity['intent-filter'] || []) {
          if (
            intentFilterHasAutoVerification(intentFilter) &&
            intentFilter?.data
          ) {
            intentFilter.data = intentFilterRemoveSchemeFromData(
              intentFilter,
              (scheme) => scheme?.startsWith('exp+')
            )
          }
        }
        break
      }
    }
  }

  return androidManifest
}

/**
 * Determine if the activity should contain the intent filters to clean.
 *
 */
function activityHasSingleTaskLaunchMode(activity) {
  return activity?.$?.['android:launchMode'] === 'singleTask'
}

/**
 * Determine if the intent filter has `autoVerify=true`.
 */
function intentFilterHasAutoVerification(intentFilter) {
  return intentFilter?.$?.['android:autoVerify'] === 'true'
}

/**
 * Remove schemes from the intent filter that matches the function.
 */
function intentFilterRemoveSchemeFromData(intentFilter, schemeMatcher) {
  return intentFilter?.data?.filter(
    (entry) => !schemeMatcher(entry?.$['android:scheme'] || '')
  )
}

module.exports = createRunOncePlugin(
  withAndroidVerifiedLinksWorkaround,
  'withAndroidVerifiedLinksWorkaround',
  '1.0.0'
)
