import * as admin from 'firebase-admin'
import * as _ from 'lodash'

import { initAdmin } from './script-init'
initAdmin()

import { getValues } from '../utils'
import { User } from '../../../common/user'
import { batchedWaitAll } from '../../../common/util/promise'
import { Contract } from '../../../common/contract'
import { updateWordScores } from '../update-recommendations'
import { getFeedContracts, doUserFeedUpdate } from '../update-user-feed'

const firestore = admin.firestore()

async function updateFeed() {
  console.log('Updating feed')

  const contracts = await getValues<Contract>(firestore.collection('contracts'))
  const feedContracts = await getFeedContracts()
  const users = await getValues<User>(
    firestore.collection('users')
    // .where('username', '==', 'JamesGrugett')
  )

  await batchedWaitAll(
    users.map((user) => async () => {
      console.log('Updating recs for', user.username)
      await updateWordScores(user, contracts)
      console.log('Updating feed for', user.username)
      await doUserFeedUpdate(user, feedContracts)
    })
  )
}

if (require.main === module) {
  updateFeed().then(() => process.exit())
}
