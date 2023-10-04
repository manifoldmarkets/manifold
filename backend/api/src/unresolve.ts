import * as admin from 'firebase-admin'
import {
  ContractResolutionPayoutTxn,
  ContractUndoResolutionPayoutTxn,
} from 'common/txn'
import { removeUndefinedProps } from 'common/util/object'
import { FieldValue } from 'firebase-admin/firestore'
import { chunk, max } from 'lodash'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { z } from 'zod'
import { validate, authEndpoint, APIError } from 'api/helpers'
import { trackPublicEvent } from 'shared/analytics'
import { getContractSupabase, getUserSupabase, log } from 'shared/utils'
import { MINUTE_MS } from 'common/util/time'
import { MINUTES_ALLOWED_TO_UNRESOLVE } from 'common/contract'
import { recordContractEdit } from 'shared/record-contract-edit'
import { isAdminId, isTrustworthy } from 'common/envs/constants'

const firestore = admin.firestore()
const bodySchema = z.object({
  contractId: z.string(),
})
const TXNS_PR_MERGED_ON = 1675693800000 // #PR 1476

export const unresolve = authEndpoint(async (req, auth) => {
  const { contractId } = validate(bodySchema, req.body)

  const contract = await getContractSupabase(contractId)

  if (!contract) throw new APIError(404, `Contract ${contractId} not found`)

  const resolutionTime = contract.resolutionTime
  if (!contract.isResolved || !resolutionTime)
    throw new APIError(400, `Contract ${contractId} is not resolved`)

  if (resolutionTime < TXNS_PR_MERGED_ON)
    throw new APIError(
      400,
      `Contract ${contractId} was resolved before payouts were unresolvable transactions.`
    )
  const pg = createSupabaseDirectClient()
  const user = await getUserSupabase(auth.uid)
  if (!user) throw new APIError(400, `User ${auth.uid} not found.`)
  const isMod = isTrustworthy(user.username) || isAdminId(auth.uid)
  if (contract.creatorId !== auth.uid && !isMod)
    throw new APIError(403, `User ${auth.uid} must be a mod to unresolve.`)
  else if (
    contract.creatorId === auth.uid &&
    resolutionTime < Date.now() - MINUTES_ALLOWED_TO_UNRESOLVE * MINUTE_MS &&
    !isMod
  ) {
    throw new APIError(400, `Contract was resolved more than 10 minutes ago.`)
  } else if (contract.creatorId === auth.uid && !isMod) {
    // check if last resolution was by admin or mod, and if so, don't allow unresolution
    const lastResolution = await pg.oneOrNone(
      `select * from audit_events where contract_id = $1
                             and name = 'resolve market'
                           order by created_time desc limit 1`,
      [contractId]
    )
    if (lastResolution && lastResolution.user_id !== auth.uid) {
      throw new APIError(400, `Contract most recently resolved by a mod.`)
    }
  }

  await trackPublicEvent(auth.uid, 'unresolve market', {
    contractId,
  })
  const updatedAttrs = await undoResolution(contractId)
  await recordContractEdit(contract, auth.uid, Object.keys(updatedAttrs))

  return { success: true }
})

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
  log('Reverting txns', txns.length)
  log('With max payout start time', maxPayoutStartTime)
  const chunkedTxns = chunk(txns, 250)
  for (const chunk of chunkedTxns) {
    await firestore.runTransaction(async (transaction) => {
      for (const txn of chunk) {
        undoContractPayoutTxn(transaction, txn)
      }
    })
  }
  log('reverted txns')
  const updatedAttrs = {
    isResolved: false,
    resolutionTime: admin.firestore.FieldValue.delete(),
    resolution: admin.firestore.FieldValue.delete(),
    resolutions: admin.firestore.FieldValue.delete(),
    resolutionProbability: admin.firestore.FieldValue.delete(),
    closeTime: Date.now(),
  }
  await firestore.doc(`contracts/${contractId}`).update(updatedAttrs)

  log('updated contract')
  return updatedAttrs
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
