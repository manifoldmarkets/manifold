import {
  CORS_ORIGIN_MANIFOLD,
  CORS_ORIGIN_LOCALHOST,
  isAdmin,
} from 'common/envs/constants'
import { NextApiRequest, NextApiResponse } from 'next'
import { applyCorsHeaders } from 'web/lib/api/cors'
import * as admin from 'firebase-admin'
import { getUserId, initAdmin } from 'web/pages/api/v0/_firebase-utils'
import {
  ContractResolutionPayoutTxn,
  ContractUndoResolutionPayoutTxn,
} from 'common/txn'
import { removeUndefinedProps } from 'common/util/object'
import { FieldValue } from 'firebase-admin/firestore'
import { chunk } from 'lodash'
import { PrivateUser } from 'common/user'

export const config = { api: { bodyParser: true } }

initAdmin()
const firestore = admin.firestore()

// NOTE: THIS MAY BREAK HORRIBLY IF YOU UNRESOLVE TWICE?
export default async function route(req: NextApiRequest, res: NextApiResponse) {
  await applyCorsHeaders(req, res, {
    origin: [CORS_ORIGIN_MANIFOLD, CORS_ORIGIN_LOCALHOST],
    methods: 'POST',
  })

  const { id } = req.query
  const contractId = id as string

  // Get the private-user to verify if user has an admin email
  // Should we allow letting question creators unresolve their own questions?
  const userId = await getUserId(req, res)
  const privateDoc = await firestore.doc(`private-users/${userId}`).get()
  const privateUser = privateDoc.data() as PrivateUser
  if (!isAdmin(privateUser.email)) {
    return res
      .status(401)
      .json({ error: 'Only admins can unresolve questions' })
  }
  await undoResolution(contractId)
  return res.status(200).json({ success: true })
}

// Copied from /backend/scripts/undo-resolution.ts
const undoResolution = async (contractId: string) => {
  const txns = await firestore
    .collection('txns')
    .where('category', '==', 'CONTRACT_RESOLUTION_PAYOUT')
    .where('fromType', '==', 'CONTRACT')
    .where('fromId', '==', contractId)
    .get()
    .then((snapshot) =>
      snapshot.docs.map((doc) => doc.data() as ContractResolutionPayoutTxn)
    )
  console.log('reverting txns', txns.length)
  const chunkedTxns = chunk(txns, 250)
  for (const chunk of chunkedTxns) {
    await firestore.runTransaction(async (transaction) => {
      for (const txn of chunk) {
        undoContractPayoutTxn(transaction, txn)
      }
    })
  }
  console.log('reverted txns')

  await firestore.doc(`contracts/${contractId}`).update({
    isResolved: false,
    resolutionTime: admin.firestore.FieldValue.delete(),
    resolution: admin.firestore.FieldValue.delete(),
    resolutionProbability: admin.firestore.FieldValue.delete(),
    closeTime: Date.now(),
  })
  console.log('updated contract')
}

export function undoContractPayoutTxn(
  fbTransaction: admin.firestore.Transaction,
  txnData: ContractResolutionPayoutTxn
) {
  const { amount, toId, data, fromId, id } = txnData
  const { deposit } = data ?? {}
  const toDoc = firestore.doc(`users/${toId}`)
  fbTransaction.update(toDoc, {
    balance: FieldValue.increment(-amount),
    totalDeposits: FieldValue.increment(-(deposit ?? 0)),
  })

  const newTxnDoc = firestore.collection(`txns/`).doc()
  const txn = {
    id: newTxnDoc.id,
    createdTime: Date.now(),
    amount: amount,
    toId: fromId,
    fromType: 'USER',
    fromId: toId,
    toType: 'CONTRACT',
    category: 'CONTRACT_UNDO_RESOLUTION_PAYOUT',
    token: 'M$',
    description: `Undo contract resolution payout from contract ${fromId}`,
    data: { revertsTxnId: id },
  } as ContractUndoResolutionPayoutTxn
  fbTransaction.create(newTxnDoc, removeUndefinedProps(txn))

  return { status: 'success', data: txnData }
}
