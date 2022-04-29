import * as admin from 'firebase-admin'
import * as _ from 'lodash'

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

if (require.main === module) {
  cacheViews().then(() => process.exit())
}
