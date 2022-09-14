import * as admin from 'firebase-admin'

import { initAdmin } from './script-init'
import { getAllPrivateUsers } from 'functions/src/utils'
import { FieldValue } from 'firebase-admin/firestore'
initAdmin()

const firestore = admin.firestore()

async function main() {
  const privateUsers = await getAllPrivateUsers()
  await Promise.all(
    privateUsers.map((privateUser) => {
      if (!privateUser.id) return Promise.resolve()
      return firestore.collection('private-users').doc(privateUser.id).update({
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        notificationPreferences: privateUser.notificationSubscriptionTypes,
        notificationSubscriptionTypes: FieldValue.delete(),
      })
    })
  )
}

if (require.main === module) main().then(() => process.exit())
