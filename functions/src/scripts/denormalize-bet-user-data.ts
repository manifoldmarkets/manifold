// Filling in the contract-based fields on comments.

import * as admin from 'firebase-admin'
import { initAdmin } from './script-init'
import { findDiffs, describeDiff, applyDiff } from './denormalize'
import { DocumentSnapshot, Transaction } from 'firebase-admin/firestore'
import { log } from '../utils'

initAdmin()
const firestore = admin.firestore()

async function getUsersById(transaction: Transaction) {
  const users = await transaction.get(firestore.collection('users'))
  const results = Object.fromEntries(users.docs.map((doc) => [doc.id, doc]))
  log(`Found ${users.size} users.`)
  return results
}

async function getBetsByUserId(transaction: Transaction) {
  const bets = await transaction.get(firestore.collectionGroup('bets'))
  const results = new Map<string, DocumentSnapshot[]>()
  bets.forEach((doc) => {
    const userId = doc.get('userId')
    const userBets = results.get(userId) || []
    userBets.push(doc)
    results.set(userId, userBets)
  })
  log(`Found ${bets.size} bets from ${results.size} users.`)
  return results
}

async function denormalize() {
  let hasMore = true
  while (hasMore) {
    hasMore = await admin.firestore().runTransaction(async (transaction) => {
      const [usersById, betsByUserId] = await Promise.all([
        getUsersById(transaction),
        getBetsByUserId(transaction),
      ])
      const mapping = Object.entries(usersById).map(([id, doc]) => {
        return [doc, betsByUserId.get(id) || []] as const
      })
      const diffs = findDiffs(
        mapping,
        ['avatarUrl', 'userAvatarUrl'],
        ['name', 'userName'],
        ['username', 'userUsername']
      )
      log(`Found ${diffs.length} bets with mismatched user data.`)
      diffs.slice(0, 500).forEach((d) => {
        log(describeDiff(d))
        applyDiff(transaction, d)
      })
      if (diffs.length > 500) {
        log(`Applying first 500 because of Firestore limit...`)
      }
      return diffs.length > 500
    })
  }
}

if (require.main === module) {
  denormalize().catch((e) => console.error(e))
}
