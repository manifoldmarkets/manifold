import { isAdminId } from 'common/envs/constants'
import * as admin from 'firebase-admin'
import {
  ContractResolutionPayoutTxn,
  ContractUndoResolutionPayoutTxn,
} from 'common/txn'
import { removeUndefinedProps } from 'common/util/object'
import { FieldValue } from 'firebase-admin/firestore'
import { chunk, max } from 'lodash'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUser } from 'shared/utils'
import { APIError } from 'common/api'
import { z } from 'zod'
import { validate, authEndpoint } from 'api/helpers'

const bodySchema = z.object({
  contractId: z.string(),
})

export const unresolve = authEndpoint(async (req, auth) => {
  const { contractId } = validate(bodySchema, req.body)

  const user = await getUser(auth.uid)
  if (!isAdminId(user?.id ?? '_')) {
    throw new APIError(403, `User ${user?.id} must be an admin to unresolve.`)
  }
  await undoResolution(contractId)
  return { success: true }
})
const firestore = admin.firestore()

// Copied from /backend/scripts/undo-resolution.ts
const undoResolution = async (contractId: string) => {
  const pg = createSupabaseDirectClient()
  const uniqueStartTimes = await pg.map(
    `select distinct data->'data'->'payoutStartTime' as payout_start_time
            FROM txns WHERE data->>'category' = 'CONTRACT_RESOLUTION_PAYOUT'
             AND data->>'fromType' = 'CONTRACT'
           AND data->>'fromId' = $1`,
    [contractId],
    (r) => r.payout_start_time as number | null
  )
  const maxPayoutStartTime = max(uniqueStartTimes)
  let txns: ContractResolutionPayoutTxn[]
  if (maxPayoutStartTime) {
    txns = await pg.map(
      `SELECT * FROM txns WHERE data->>'category' = 'CONTRACT_RESOLUTION_PAYOUT'
                      AND data->>'fromType' = 'CONTRACT'
                      AND data->>'fromId' = $1
                      AND (data->'data'->>'payoutStartTime')::numeric = $2`,
      [contractId, maxPayoutStartTime],
      (r) => r.data as ContractResolutionPayoutTxn
    )
  } else {
    txns = await pg.map(
      `SELECT * FROM txns WHERE data->>'category' = 'CONTRACT_RESOLUTION_PAYOUT'
                     AND data->>'fromType' = 'CONTRACT' 
                     AND data->>'fromId' = $1`,
      [contractId],
      (r) => r.data as ContractResolutionPayoutTxn
    )
  }
  console.log('Reverting txns', txns.length)
  console.log('With max payout start time', maxPayoutStartTime)
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
    resolutions: admin.firestore.FieldValue.delete(),
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
