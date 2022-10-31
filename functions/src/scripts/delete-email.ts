import * as admin from 'firebase-admin'

import { initAdmin } from './script-init'
initAdmin()
import { FieldValue } from 'firebase-admin/firestore'
import { getAllUsers } from '../utils'
import { batchedWaitAll } from 'common/util/promise'

const firestore = admin.firestore()

async function main() {
  const users = await getAllUsers()
  console.log('Loaded', users.length, 'users')

  await batchedWaitAll(
    users.map((user) => async () => {
      const u = user as any
      if (!u.email) return

      console.log('delete email for', u.id, u.email)
      await firestore.collection('users').doc(user.id).update({
        email: FieldValue.delete(),
      })
    }),
    100
  )
}

if (require.main === module) main().then(() => process.exit())
