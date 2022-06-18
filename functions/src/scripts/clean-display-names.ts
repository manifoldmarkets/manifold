// For a while, we didn't enforce that display names would be clean in the `updateUserInfo`
// cloud function, so this script hunts down unclean ones.

import * as admin from 'firebase-admin'
import { initAdmin } from './script-init'
import { cleanDisplayName } from '../../../common/util/clean-username'
import { log, writeUpdatesAsync, UpdateSpec } from '../utils'
initAdmin()
const firestore = admin.firestore()

if (require.main === module) {
  const usersColl = firestore.collection('users')
  usersColl.get().then(async (userSnaps) => {
    log(`Loaded ${userSnaps.size} users.`)
    const updates = userSnaps.docs.reduce((acc, u) => {
      const name = u.data().name
      if (name != cleanDisplayName(name)) {
        acc.push({ doc: u.ref, fields: { name: cleanDisplayName(name) } })
      }
      return acc
    }, [] as UpdateSpec[])
    log(`Found ${updates.length} users to update:`, updates)
    await writeUpdatesAsync(firestore, updates)
    log(`Updated all users.`)
  })
}
