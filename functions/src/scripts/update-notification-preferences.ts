import * as admin from 'firebase-admin'

import { initAdmin } from './script-init'
import { getPrivateUser } from 'functions/src/utils'
import { filterDefined } from 'common/lib/util/array'
import { FieldValue } from 'firebase-admin/firestore'
initAdmin()

const firestore = admin.firestore()

async function main() {
  // const privateUsers = await getAllPrivateUsers()
  const privateUsers = filterDefined([
    await getPrivateUser('6hHpzvRG0pMq8PNJs7RZj2qlZGn2'),
  ])
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
