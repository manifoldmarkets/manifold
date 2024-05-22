import { BountyAddedTxn, BountyAwardedTxn, BountyCanceledTxn } from 'common/txn'
import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { APIError } from 'common//api/utils'
import { BountiedQuestionContract, Contract } from 'common/contract'
import { insertTxn, runTxn } from './run-txn'
import {
  SupabaseTransaction,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { getUser } from 'shared/utils'
import { incrementBalance } from 'shared/supabase/users'

export async function runAddBountyTxn(
  txnData: Omit<BountyAddedTxn, 'id' | 'createdTime'>
) {
  const { amount, toId, fromId } = txnData
  const pg = createSupabaseDirectClient()

  const contractDoc = firestore.doc(`contracts/${toId}`)
  const contractSnap = await contractDoc.get()
  if (!contractSnap.exists) throw new APIError(404, 'Contract not found')
  const contract = contractSnap.data() as Contract
  if (
    contract.mechanism !== 'none' ||
    contract.outcomeType !== 'BOUNTIED_QUESTION'
  ) {
    throw new APIError(
      403,
      'Invalid contract, only bountied questions are supported'
    )
  }

  const txn = await pg.tx(async (tx) => {
    const txn = await runTxn(tx, txnData)

    // update bountied contract
    contractDoc.update(contractDoc, {
      totalBounty: FieldValue.increment(amount),
      bountyLeft: FieldValue.increment(amount),
    })

    return txn
  })
  return txn
}

export async function runAwardBountyTxn(
  tx: SupabaseTransaction,
  txnData: Omit<BountyAwardedTxn, 'id' | 'createdTime'>
) {
  const { amount, fromId } = txnData

  const txn = await runTxn(tx, txnData)

  await firestore.runTransaction(async (fbTransaction) => {
    const contractDoc = firestore.doc(`contracts/${fromId}`)
    const contractSnap = await fbTransaction.get(contractDoc)
    if (!contractSnap.exists) throw new APIError(404, 'Contract not found')
    const contract = contractSnap.data() as BountiedQuestionContract

    const { bountyLeft } = contract
    if (bountyLeft < amount) {
      throw new APIError(
        400,
        `There is only M${bountyLeft} of bounty left to award, which is less than M${amount}`
      )
    }

    // update bountied contract
    fbTransaction.update(contractDoc, {
      bountyLeft: FieldValue.increment(-amount),
      bountyTxns: FieldValue.arrayUnion(txn.id),
    })
  })

  return txn
}

export async function runCancelBountyTxn(
  txnData: Omit<BountyCanceledTxn, 'id' | 'createdTime'>,
  contractCloseTime?: number
) {
  const { fromId, toId } = txnData
  const pg = createSupabaseDirectClient()

  return await pg.tx(async (tx) => {
    const user = await getUser(toId, tx)
    if (!user) throw new APIError(404, `User ${toId} not found`)

    await incrementBalance(tx, toId, {
      balance: txnData.amount,
      totalDeposits: txnData.amount,
    })

    const txn = await runTxn(tx, txnData)

    await firestore.runTransaction(async (fbTransaction) => {
      const contractRef = firestore.doc(`contracts/${fromId}`)
      const contractSnap = await fbTransaction.get(contractRef)
      if (!contractSnap.exists) throw new APIError(404, 'Contract not found')
      const contract = contractSnap.data() as BountiedQuestionContract

      const amount = contract.bountyLeft
      if (amount != txnData.amount) {
        throw new APIError(
          500,
          'Amount changed since bounty transaction concluded. possible duplicate call'
        )
      }

      // update bountied contract
      const resolutionTime = Date.now()
      const closeTime =
        !contractCloseTime || contractCloseTime > resolutionTime
          ? resolutionTime
          : contractCloseTime

      fbTransaction.update(contractRef, {
        bountyLeft: FieldValue.increment(-amount),
        closeTime,
        isResolved: true,
        resolutionTime,
        resolverId: txn.toId,
        lastUpdatedTime: resolutionTime,
        bountyTxns: FieldValue.arrayUnion(txn.id),
      })
    })
    return txn
  })
}

const firestore = admin.firestore()
