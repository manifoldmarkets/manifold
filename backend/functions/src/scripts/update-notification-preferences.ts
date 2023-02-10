import * as admin from 'firebase-admin'

import { initAdmin } from './script-init'
initAdmin()
import { getAllPrivateUsers } from 'shared/utils'
import { uniq } from 'lodash'
import { notification_destination_types } from 'common/user-notification-preferences'

async function main() {
  const firestore = admin.firestore()
  const privateUsers = await getAllPrivateUsers()
  // filter out users who have already opted in to browser notifications
  const privateUsersToOptIn = privateUsers.filter((privateUser) => {
    if (!privateUser.id) return false
    const previousProfitLossPrefs =
      privateUser.notificationPreferences.profit_loss_updates ?? []
    return !previousProfitLossPrefs.includes('browser')
  })
  console.log(
    `Opting in ${privateUsersToOptIn.length} users to browser notifications`
  )
  // TODO: this seems to only be capable of updating a few thousand users at a time and must be rerun multiple times
  await Promise.all(
    privateUsersToOptIn.map((privateUser) => {
      if (!privateUser.id) return
      const previousProfitLossPrefs =
        privateUser.notificationPreferences.profit_loss_updates ?? []
      return firestore
        .collection('private-users')
        .doc(privateUser.id)
        .update({
          notificationPreferences: {
            ...privateUser.notificationPreferences,
            profit_loss_updates: uniq([
              ...previousProfitLossPrefs,
              'browser',
            ]) as notification_destination_types[],
          },
        })
    })
  )
}

if (require.main === module) main().then(() => process.exit())
