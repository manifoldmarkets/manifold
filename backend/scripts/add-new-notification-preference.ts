import * as admin from 'firebase-admin'

import { initAdmin } from 'shared/init-admin'
initAdmin()
import { getAllPrivateUsers, isProd } from 'shared/utils'
import {
  getDefaultNotificationPreferences,
  notification_preference,
} from 'common/user-notification-preferences'
import { filterDefined } from 'common/util/array'

const firestore = admin.firestore()
async function main() {
  const privateUsers = filterDefined(await getAllPrivateUsers())
  const defaults = getDefaultNotificationPreferences(!isProd())

  await Promise.all(
    privateUsers.map((privateUser) => {
      if (!privateUser.id) return Promise.resolve()
      const prefs = privateUser.notificationPreferences
        ? privateUser.notificationPreferences
        : defaults
      // Add your new pref here, and be sure to add the default as well
      const newPref: notification_preference =
        'some_comments_on_watched_markets'
      if (prefs[newPref] === undefined) {
        prefs[newPref] = defaults[newPref]
      }
      return firestore
        .collection('private-users')
        .doc(privateUser.id)
        .update({
          notificationPreferences: {
            ...prefs,
          },
        })
    })
  )
}

if (require.main === module) main().then(() => process.exit())
