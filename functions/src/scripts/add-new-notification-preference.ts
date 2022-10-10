import * as admin from 'firebase-admin'

import { initAdmin } from './script-init'
import { filterDefined } from 'common/lib/util/array'
import { getPrivateUser } from '../utils'
initAdmin()

const firestore = admin.firestore()

async function main() {
  // const privateUsers = await getAllPrivateUsers()
  const privateUsers = filterDefined([
    await getPrivateUser('ddSo9ALC15N9FAZdKdA2qE3iIvH3'),
  ])
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
      if (privateUser.notificationPreferences.opt_out_all === undefined) {
        console.log('updating opt out all', privateUser.id)
        return firestore
          .collection('private-users')
          .doc(privateUser.id)
          .update({
            notificationPreferences: {
              ...privateUser.notificationPreferences,
              opt_out_all: [],
            },
          })
      }
      return
    })
  )
}

if (require.main === module) main().then(() => process.exit())
