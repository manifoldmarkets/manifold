import * as admin from 'firebase-admin'

import { initAdmin } from './script-init'
import { getValues } from '../utils'
import { FieldValue } from 'firebase-admin/firestore'
import { User } from 'common/user'

initAdmin()

const firestore = admin.firestore()

async function main() {
  const collection = 'users'
  const users = await getValues<User>(firestore.collection(collection))
  await Promise.all(
    users.map(async (user) => {
      await firestore.collection(collection).doc(user.id).update({
        followedCategories: FieldValue.delete(),
      })
    })
  )
}

if (require.main === module) main().then(() => process.exit())
