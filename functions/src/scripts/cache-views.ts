import * as admin from 'firebase-admin'
import * as _ from 'lodash'

import { initAdmin } from './script-init'
initAdmin()

import { getUserByUsername, getValues } from '../utils'
import { View } from '../../../common/tracking'

const firestore = admin.firestore()

async function cacheViews() {
  console.log('Caching views')

  const user = await getUserByUsername('JamesGrugett')

  if (user) {
    console.log('Caching views for', user.username)
    await cacheUserViews(user.id)
  }
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
    .doc(`private-users/${userId}/cached/viewCounts`)
    .set(viewCounts, { merge: true })

  await firestore
    .doc(`private-users/${userId}/cached/lastViewTime`)
    .set(lastViewTime, { merge: true })

  console.log(viewCounts, lastViewTime)
}

if (require.main === module) {
  cacheViews().then(() => process.exit())
}
