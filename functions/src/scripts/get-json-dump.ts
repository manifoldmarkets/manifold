import * as admin from 'firebase-admin'
import * as fs from 'fs'

import { initAdmin } from './script-init'
initAdmin()

import { Bet } from '../../../common/bet'
import { Contract } from '../../../common/contract'
import { getValues } from '../utils'
import { Comment } from '../../../common/comment'

const firestore = admin.firestore()

async function getJsonDump() {
  console.log('Downloading contracts')
  const contracts = await getValues<Contract>(firestore.collection('contracts'))
  console.log('Loaded contracts', contracts.length)
  fs.writeFileSync('contracts.json', JSON.stringify(contracts, null, 2))

  console.log('Downloading bets')
  const bets = await getValues<Bet>(firestore.collectionGroup('bets'))
  console.log('Loaded bets', bets.length)
  fs.writeFileSync('bets.json', JSON.stringify(bets, null, 2))

  console.log('Downloading comments')
  const comments = await getValues<Comment>(
    firestore.collectionGroup('comments')
  )
  console.log('Loaded comments', comments.length)
  fs.writeFileSync('comments.json', JSON.stringify(comments, null, 2))
}

if (require.main === module) getJsonDump().then(() => process.exit())
