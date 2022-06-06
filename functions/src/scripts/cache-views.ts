import * as admin from 'firebase-admin'

import { initAdmin } from './script-init'
initAdmin()

import { getValues } from '../utils'
import { View } from '../../../common/tracking'
import { User } from '../../../common/user'
import { batchedWaitAll } from '../../../common/util/promise'

const firestore = admin.firestore()

async function cacheViews() {
  console.log('Caching views')

  const users = await getValues<User>(firestore.collection('users'))

  await batchedWaitAll(
    users.map((user) => () => {
      console.log('Caching views for', user.username)
      return cacheUserViews(user.id)
    })
  )
}

async function cacheUserViews(userId: string) {
  const views = await getValues<View>(
    firestore.collection('private-users').doc(userId).collection('views')
  )

  const viewCounts: { [contractId: string]: number } = {}
  for (const view of views) {
    viewCounts[view.contractId] = (viewCounts[view.contractId] ?? 0) + 1
  }

  const lastViewTime: { [contractId: string]: number } = {}
  for (const view of views) {
    lastViewTime[view.contractId] = Math.max(
      lastViewTime[view.contractId] ?? 0,
      view.timestamp
    )
  }

  await firestore
    .doc(`private-users/${userId}/cache/viewCounts`)
    .set(viewCounts, { merge: true })

  await firestore
    .doc(`private-users/${userId}/cache/lastViewTime`)
    .set(lastViewTime, { merge: true })

  console.log(viewCounts, lastViewTime)
}

// async function deleteCache() {
//   console.log('Deleting view cache')

//   const users = await getValues<User>(firestore.collection('users'))

//   await batchedWaitAll(
//     users.map((user) => async () => {
//       console.log('Deleting view cache for', user.username)
//       await firestore.doc(`private-users/${user.id}/cache/viewCounts`).delete()
//       await firestore
//         .doc(`private-users/${user.id}/cache/lastViewTime`)
//         .delete()
//       await firestore
//         .doc(`private-users/${user.id}/cache/contractScores`)
//         .delete()
//       await firestore.doc(`private-users/${user.id}/cache/wordScores`).delete()
//     })
//   )
// }

if (require.main === module) {
  cacheViews().then(() => process.exit())
}
