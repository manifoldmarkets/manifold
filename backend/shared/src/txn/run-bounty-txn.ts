import { BountyAddedTxn, BountyAwardedTxn, BountyCanceledTxn } from 'common/txn'
import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { User } from 'common/user'
import { APIError } from 'common//api/utils'
import { BountiedQuestionContract, Contract } from 'common/contract'
import { insertTxn } from './run-txn'
import {
  SupabaseTransaction,
  createSupabaseDirectClient,
} from 'shared/supabase/init'

export async function runAddBountyTxn(
  txnData: Omit<BountyAddedTxn, 'id' | 'createdTime'>
) {
  const { amount, toId, fromId } = txnData
  const pg = createSupabaseDirectClient()

  firestore.runTransaction(async (fbTransaction) => {
    const contractDoc = firestore.doc(`contracts/${toId}`)
    const contractSnap = await fbTransaction.get(contractDoc)
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

    const userDoc = firestore.doc(`users/${fromId}`)
    const userSnap = await fbTransaction.get(userDoc)
    const user = userSnap.data() as User

    if (amount > user.balance)
      throw new APIError(403, `Balance must be at least ${amount}.`)

    // update user
    fbTransaction.update(userDoc, {
      balance: FieldValue.increment(-amount),
      totalDeposits: FieldValue.increment(-amount),
    })

    // update bountied contract
    fbTransaction.update(contractDoc, {
      totalBounty: FieldValue.increment(amount),
      bountyLeft: FieldValue.increment(amount),
    })
  })

  const txn = await pg.tx((tx) => insertTxn(tx, txnData))
  return txn
}

export async function runAwardBountyTxn(
  tx: SupabaseTransaction,
  txnData: Omit<BountyAwardedTxn, 'id' | 'createdTime'>,
  authUid: string
) {
  const { amount, toId, fromId } = txnData

  await firestore.runTransaction(async (fbTransaction) => {
    const contractDoc = firestore.doc(`contracts/${fromId}`)
    const contractSnap = await fbTransaction.get(contractDoc)
    if (!contractSnap.exists) throw new APIError(404, 'Contract not found')
    const contract = contractSnap.data() as Contract
    if (
      contract.mechanism !== 'none' ||
      contract.outcomeType !== 'BOUNTIED_QUESTION'
    ) {
      throw new APIError(
        400,
        'Invalid contract, only bountied questions are supported'
      )
    }

    if (contract.creatorId !== authUid) {
      throw new APIError(
        403,
        'A bounty can only be given by the creator of the question'
      )
    }

    const recipientDoc = firestore.doc(`users/${toId}`)

    const { bountyLeft } = contract
    if (bountyLeft < amount) {
      throw new APIError(
        400,
        `There is only M${bountyLeft} of bounty left to award, which is less than M${amount}`
      )
    }

    if (!isFinite(bountyLeft - amount)) {
      throw new APIError(
        500,
        'Invalid bounty balance left for ' + contract.question
      )
    }

    // update user
    fbTransaction.update(recipientDoc, {
      balance: FieldValue.increment(amount),
      totalDeposits: FieldValue.increment(amount),
    })

    // update bountied contract
    fbTransaction.update(contractDoc, {
      bountyLeft: FieldValue.increment(-amount),
      bountyTxns: FieldValue.arrayUnion(txn.id),
    })
  })

  const txn = await insertTxn(tx, txnData)
  return txn
}

export async function runCancelBountyTxn(
  txnData: Omit<BountyCanceledTxn, 'id' | 'createdTime'>,
  contractCloseTime?: number
) {
  const { fromId, toId } = txnData
  const pg = createSupabaseDirectClient()

  await firestore.runTransaction(async (fbTransaction) => {
    const contractRef = firestore.doc(`contracts/${fromId}`)
    const contractSnap = await fbTransaction.get(contractRef)
    if (!contractSnap.exists) throw new APIError(404, 'Contract not found')
    const contract = contractSnap.data() as BountiedQuestionContract

    const userRef = firestore.doc(`users/${toId}`)
    const userSnap = await fbTransaction.get(userRef)
    if (!userSnap.exists) throw new APIError(404, 'User not found')

    const amount = contract.bountyLeft
    txnData.amount = amount

    // update user
    fbTransaction.update(userRef, {
      balance: FieldValue.increment(amount),
      totalDeposits: FieldValue.increment(amount),
    })

    // update bountied contract
    fbTransaction.update(contractRef, {
      bountyLeft: FieldValue.increment(-amount),
      closeTime:
        !contractCloseTime || contractCloseTime > Date.now()
          ? Date.now()
          : contractCloseTime,
    })
  })

  const txn = await pg.tx((tx) => insertTxn(tx, txnData))

  firestore.doc(`contracts/${txn.toId}`).update({
    bountyTxns: FieldValue.arrayUnion(txn.id),
  })

  return txn
}

const firestore = admin.firestore()
