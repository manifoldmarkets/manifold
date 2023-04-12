import * as admin from 'firebase-admin'
import { initAdmin } from 'shared/init-admin'
import { findDiffs, describeDiff, applyDiff } from './denormalize'
import { DocumentSnapshot, Transaction } from 'firebase-admin/firestore'

initAdmin()
const firestore = admin.firestore()

async function getContractsById(transaction: Transaction) {
  const contracts = await transaction.get(firestore.collection('contracts'))
  const results = Object.fromEntries(contracts.docs.map((doc) => [doc.id, doc]))
  console.log(`Found ${contracts.size} contracts.`)
  return results
}

async function getBetsByContractId(transaction: Transaction) {
  const bets = await transaction.get(
    firestore.collectionGroup('bets').where('contractId', '!=', null)
  )
  const results = new Map<string, DocumentSnapshot[]>()
  bets.forEach((doc) => {
    const contractId = doc.get('contractId')
    const contractsBets = results.get(contractId) || []
    contractsBets.push(doc)
    results.set(contractId, contractsBets)
  })
  console.log(`Found ${bets.size} comments on ${results.size} contracts.`)
  return results
}

async function backfillVisibility() {
  let hasMore = true
  while (hasMore) {
    hasMore = await admin.firestore().runTransaction(async (transaction) => {
      const [contractsById, betsByContractId] = await Promise.all([
        getContractsById(transaction),
        getBetsByContractId(transaction),
      ])
      const mapping = Object.entries(contractsById).map(([id, doc]) => {
        return [doc, betsByContractId.get(id) || []] as const
      })
      const diffs = findDiffs(mapping, ['visibility', 'visibility'])
      console.log(`Found ${diffs.length} bets with mismatched visibility.`)
      diffs.slice(0, 500).forEach((d) => {
        console.log(describeDiff(d))
        applyDiff(transaction, d)
      })
      if (diffs.length > 500) {
        console.log(`Applying first 500 because of Firestore limit...`)
      }
      return diffs.length > 500
    })
  }
}

if (require.main === module) {
  backfillVisibility().catch((e) => console.error(e))
}
