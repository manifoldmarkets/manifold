import { BountyAddedTxn, BountyAwardedTxn, BountyCanceledTxn } from 'common/txn'
import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { removeUndefinedProps } from 'common/util/object'
import { User } from 'common/user'
import { APIError } from 'common//api/utils'
import { Contract } from 'common/contract'

export async function runAddBountyTxn(
  fbTransaction: admin.firestore.Transaction,
  txnData: Omit<BountyAddedTxn, 'id' | 'createdTime'>
) {
  const { amount, toId, fromId } = txnData

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

  const newTxnDoc = firestore.collection(`txns/`).doc()
  const txn = { id: newTxnDoc.id, createdTime: Date.now(), ...txnData }
  fbTransaction.create(newTxnDoc, removeUndefinedProps(txn))

  return txn
}

export async function runAwardBountyTxn(
  fbTransaction: admin.firestore.Transaction,
  txnData: Omit<BountyAwardedTxn, 'id' | 'createdTime'>,
  authUid: string
) {
  const { amount, toId, fromId } = txnData

  const contractDoc = firestore.doc(`contracts/${fromId}`)
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
      403,
      `There is only M${bountyLeft} of bounty left to award, which is less than M${amount}`
    )
  }

  if (!isFinite(bountyLeft - amount)) {
    throw new APIError(
      500,
      'Invalid bounty balance left for ' + contract.question
    )
  }

  const newTxnDoc = firestore.collection(`txns/`).doc()
  const txn = { id: newTxnDoc.id, createdTime: Date.now(), ...txnData }
  fbTransaction.create(newTxnDoc, removeUndefinedProps(txn))

  // update user
  fbTransaction.update(recipientDoc, {
    balance: FieldValue.increment(amount),
    totalDeposits: FieldValue.increment(amount),
  })

  // update bountied contract
  fbTransaction.update(contractDoc, {
    bountyLeft: FieldValue.increment(-amount),
    bountyTxns: FieldValue.arrayUnion(newTxnDoc.id),
  })

  return txn
}

export async function runCancelBountyTxn(
  fbTransaction: admin.firestore.Transaction,
  txnData: Omit<BountyCanceledTxn, 'id' | 'createdTime'>,
  contractRef: admin.firestore.DocumentReference,
  userRef: admin.firestore.DocumentReference,
  contractCloseTime?: number
) {
  const { amount } = txnData

  const newTxnDoc = firestore.collection(`txns/`).doc()
  const txn = { id: newTxnDoc.id, createdTime: Date.now(), ...txnData }
  fbTransaction.create(newTxnDoc, removeUndefinedProps(txn))

  // update user
  fbTransaction.update(userRef, {
    balance: FieldValue.increment(amount),
    totalDeposits: FieldValue.increment(amount),
  })

  // update bountied contract
  fbTransaction.update(contractRef, {
    bountyLeft: FieldValue.increment(-amount),
    bountyTxns: FieldValue.arrayUnion(newTxnDoc.id),
    closeTime:
      !contractCloseTime || contractCloseTime > Date.now()
        ? Date.now()
        : contractCloseTime,
  })

  return { status: 'success', txn }
}
const firestore = admin.firestore()
