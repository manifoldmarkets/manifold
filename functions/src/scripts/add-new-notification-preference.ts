import * as admin from 'firebase-admin'

import { initAdmin } from './script-init'
initAdmin()
import { getPrivateUser } from 'functions/src/utils'
import { notification_preference } from 'common/user-notification-preferences'
import { filterDefined } from 'common/util/array'

const firestore = admin.firestore()
async function main() {
  // const privateUsers = await getAllPrivateUsers()
  const privateUsers = filterDefined([
    await getPrivateUser('6hHpzvRG0pMq8PNJs7RZj2qlZGn2'),
    await getPrivateUser('eHn5FXMK1leAsVoEjqg6Mh9tGqn2'),
  ])
  await Promise.all(
    privateUsers.map((privateUser) => {
      if (!privateUser.id) return Promise.resolve()
      const prefs = privateUser.notificationPreferences
      const enablePushFor: Array<notification_preference> = [
        'all_replies_to_my_comments_on_watched_markets',
        'all_replies_to_my_answers_on_watched_markets',
        'resolutions_on_watched_markets',
        'resolutions_on_watched_markets_with_shares_in',
        'contract_from_followed_user',
        'probability_updates_on_watched_markets',
      ]
      enablePushFor.forEach((pref) => {
        const userInterestedInNotifs =
          (prefs[pref].includes('email') || prefs[pref].includes('browser')) &&
          !prefs[pref].includes('mobile')
        if (userInterestedInNotifs) prefs[pref].push('mobile')
      })

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
