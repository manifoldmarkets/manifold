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

// Add your new pref here, and be sure to add the default as well
const NEW_PREFERENCE_KEY: notification_preference =
  'poll_close_on_watched_markets'

async function main() {
  const privateUsers = filterDefined(await getAllPrivateUsers())
  // const privateUsers = filterDefined([
  //   await getPrivateUser('AJwLWoo3xue32XIiAVrL5SyR1WB2'),
  // ])
  const defaults = getDefaultNotificationPreferences(!isProd())
  console.log('Updating', privateUsers.length, 'users')
  let count = 0
  await Promise.all(
    privateUsers.map(async (privateUser) => {
      if (!privateUser.id) return
      const currentUserPreferences = privateUser.notificationPreferences
        ? privateUser.notificationPreferences
        : defaults
      if (currentUserPreferences[NEW_PREFERENCE_KEY] === undefined) {
        currentUserPreferences[NEW_PREFERENCE_KEY] =
          defaults[NEW_PREFERENCE_KEY]
        try {
          await firestore
            .collection('private-users')
            .doc(privateUser.id)
            .update({
              notificationPreferences: {
                ...currentUserPreferences,
              },
            })
        } catch (e) {
          console.log(e)
          console.log('Error updating user', privateUser.id)
        }
      }
      count++
      if (count % 100 === 0)
        console.log('Updated', count, 'users of', privateUsers.length)
    })
  )
}

if (require.main === module) main().then(() => process.exit())
