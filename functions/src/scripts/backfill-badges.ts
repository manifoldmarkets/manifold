import * as admin from 'firebase-admin'

import { initAdmin } from './script-init'
import { getAllUsers } from '../utils'
import { FieldValue } from 'firebase-admin/firestore'

initAdmin()

const firestore = admin.firestore()

async function main() {
  const users = await getAllUsers()
  await Promise.all(
    users.map(async (user) => {
      if (!user.id) return
      await firestore.collection('users').doc(user.id).update({
        achievements: FieldValue.delete(),
      })
    })
  )
}

if (require.main === module) main().then(() => process.exit())
