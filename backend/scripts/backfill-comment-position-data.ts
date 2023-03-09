// Filling in historical bet positions on comments.

// Warning: This just recalculates all of them, rather than trying to
// figure out which ones are out of date, since I'm using it to fill them
// in once in the first place.

import { maxBy } from 'lodash'
import * as admin from 'firebase-admin'
import { filterDefined } from 'common/util/array'
import { Bet } from 'common/bet'
import { Comment } from 'common/comment'
import { Contract } from 'common/contract'
import { getLargestPosition } from 'common/calculate'
import { initAdmin } from 'shared/init-admin'
import { DocumentSnapshot } from 'firebase-admin/firestore'
import { log, writeAsync } from 'shared/utils'

initAdmin()
const firestore = admin.firestore()

async function getContractsById() {
  const contracts = await firestore.collection('contracts').get()
  const results = Object.fromEntries(
    contracts.docs.map((doc) => [doc.id, doc.data() as Contract])
  )
  log(`Found ${contracts.size} contracts.`)
  return results
}

async function getCommentsByContractId() {
  const comments = await firestore
    .collectionGroup('comments')
    .where('contractId', '!=', null)
    .get()
  const results = new Map<string, DocumentSnapshot[]>()
  comments.forEach((doc) => {
    const contractId = doc.get('contractId')
    const contractComments = results.get(contractId) || []
    contractComments.push(doc)
    results.set(contractId, contractComments)
  })
  log(`Found ${comments.size} comments on ${results.size} contracts.`)
  return results
}

// not in a transaction for speed -- may need to be run more than once
async function denormalize() {
  const contractsById = await getContractsById()
  const commentsByContractId = await getCommentsByContractId()
  for (const [contractId, comments] of commentsByContractId.entries()) {
    const betsQuery = await firestore
      .collection('contracts')
      .doc(contractId)
      .collection('bets')
      .get()
    log(`Loaded ${betsQuery.size} bets for contract ${contractId}.`)
    const bets = betsQuery.docs.map((d) => d.data() as Bet)
    const updates = comments.map((doc) => {
      const comment = doc.data() as Comment
      const contract = contractsById[contractId]
      const previousBets = bets.filter(
        (b) => b.createdTime < comment.createdTime
      )
      const position = getLargestPosition(
        contract,
        previousBets.filter((b) => b.userId === comment.userId && !b.isAnte)
      )
      if (position) {
        const fields: { [k: string]: unknown } = {
          commenterPositionShares: position.shares,
          commenterPositionOutcome: position.outcome,
        }
        const previousProb =
          contract.outcomeType === 'BINARY'
            ? maxBy(previousBets, (bet) => bet.createdTime)?.probAfter
            : undefined
        if (previousProb != null) {
          fields.commenterPositionProb = previousProb
        }
        return { doc: doc.ref, fields }
      } else {
        return undefined
      }
    })
    log(`Updating ${updates.length} comments.`)
    await writeAsync(firestore, filterDefined(updates))
  }
}

if (require.main === module) {
  denormalize().catch((e) => console.error(e))
}
