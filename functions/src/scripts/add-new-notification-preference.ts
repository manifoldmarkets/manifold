import * as admin from 'firebase-admin'

import { initAdmin } from './script-init'
import { getAllPrivateUsers } from 'functions/src/utils'
initAdmin()

const firestore = admin.firestore()

async function main() {
  const privateUsers = await getAllPrivateUsers()
  await Promise.all(
    privateUsers.map((privateUser) => {
      if (!privateUser.id) return Promise.resolve()
      return firestore
        .collection('private-users')
        .doc(privateUser.id)
        .update({
          notificationPreferences: {
            ...privateUser.notificationPreferences,
            badges_awarded: ['browser'],
          },
        })
    })
  )
}

if (require.main === module) main().then(() => process.exit())
