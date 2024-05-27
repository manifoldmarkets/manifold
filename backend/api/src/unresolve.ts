import * as admin from 'firebase-admin'
import {
  ContractOldResolutionPayoutTxn,
  ContractProduceSpiceTxn,
  ContractUndoOldResolutionPayoutTxn,
  ContractUndoProduceSpiceTxn,
} from 'common/txn'
import { chunk } from 'lodash'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError, APIHandler } from 'api/helpers/endpoint'
import { trackPublicEvent } from 'shared/analytics'
import { log, getContractSupabase } from 'shared/utils'
import { MINUTE_MS } from 'common/util/time'
import { Contract, MINUTES_ALLOWED_TO_UNRESOLVE } from 'common/contract'
import { recordContractEdit } from 'shared/record-contract-edit'
import { isAdminId, isModId } from 'common/envs/constants'
import { acquireLock, releaseLock } from 'shared/firestore-lock'
import { TxnData, insertTxns } from 'shared/txn/run-txn'
import { setAdjustProfitFromResolvedMarkets } from 'shared/helpers/user-contract-metrics'
import { bulkIncrementBalances } from 'shared/supabase/users'

const firestore = admin.firestore()

const TXNS_PR_MERGED_ON = 1675693800000 // #PR 1476

export const unresolve: APIHandler<'unresolve'> = async (props, auth) => {
  const { contractId, answerId } = props

  let contract = await getContractSupabase(contractId)

  if (!contract) throw new APIError(404, `Contract ${contractId} not found`)
  await verifyUserCanUnresolve(contract, auth.uid, answerId)

  const lockId = answerId ? `${contract.id}-${answerId}` : contract.id
  const acquiredLock = await acquireLock(lockId)
  if (!acquiredLock) {
    throw new APIError(
      403,
      `Contract ${contract.id} is already being resolved/unresolved (failed to acquire lock)`
    )
  }

  try {
    // Fetch fresh contract & verify within lock.
    const contractSnap = await firestore
      .collection('contracts')
      .doc(contract.id)
      .get()
    contract = contractSnap.data() as Contract
    await verifyUserCanUnresolve(contract, auth.uid, answerId)

    await trackPublicEvent(auth.uid, 'unresolve market', {
      contractId,
    })
    await undoResolution(contract, auth.uid, answerId)
  } finally {
    await releaseLock(lockId)
  }

  return {
    success: true,
    continue: async () => {
      await setAdjustProfitFromResolvedMarkets(contractId)
    },
  }
}

const verifyUserCanUnresolve = async (
  contract: Contract,
  userId: string,
  answerId?: string
) => {
  const isMod = isModId(userId) || isAdminId(userId)
  const pg = createSupabaseDirectClient()

  if (contract.creatorId === userId && !isMod) {
    // Check if last resolution was by admin or mod, and if so, don't allow unresolution
    const lastResolution = await pg.oneOrNone(
      `select *
         from audit_events
         where contract_id = $1
           and name = 'resolve market'
         order by created_time desc
         limit 1`,
      [contract.id]
    )
    if (lastResolution && lastResolution.user_id !== userId) {
      throw new APIError(400, `Contract most recently resolved by a mod.`)
    }
  }
  const resolutionTime = contract.resolutionTime
  if (
    contract.mechanism !== 'cpmm-multi-1' ||
    (contract.mechanism === 'cpmm-multi-1' && contract.shouldAnswersSumToOne)
  ) {
    if (answerId) {
      throw new APIError(
        400,
        `Specifying answerId is not allowed for unresolving shouldAnswersSumToOne contracts.`
      )
    }
    if (!contract.isResolved || !resolutionTime)
      throw new APIError(400, `Contract ${contract.id} is not resolved`)

    if (resolutionTime < TXNS_PR_MERGED_ON)
      throw new APIError(
        400,
        `Contract ${contract.id} was resolved before payouts were unresolvable transactions.`
      )

    if (!isMod) {
      // if (SPICE_PRODUCTION_ENABLED) {
      //   throw new APIError(403, `Only mods can unresolve`)
      // }

      if (
        contract.creatorId === userId &&
        resolutionTime < Date.now() - MINUTES_ALLOWED_TO_UNRESOLVE * MINUTE_MS
      ) {
        throw new APIError(
          400,
          `Contract was resolved more than 10 minutes ago.`
        )
      }
    }
  } else if (contract.mechanism === 'cpmm-multi-1') {
    if (!answerId) {
      throw new APIError(400, `answerId is required for cpmm-multi-1 contracts`)
    }

    const answerResolutionTime = await pg.oneOrNone(
      `select data->'resolutionTime' as resolution_time
         from answers
         where id= $1
         limit 1`,
      [answerId],
      (r) => r.resolution_time as number | null
    )
    if (!answerResolutionTime)
      throw new APIError(400, `Answer ${answerId} is not resolved`)

    if (!isMod) {
      // if (SPICE_PRODUCTION_ENABLED) {
      //   throw new APIError(403, `Only mods can unresolve`)
      // }

      if (
        contract.creatorId === userId &&
        answerResolutionTime <
          Date.now() - MINUTES_ALLOWED_TO_UNRESOLVE * MINUTE_MS
      ) {
        throw new APIError(400, `Answer was resolved more than 10 minutes ago.`)
      }
    }
  }

  if (contract.creatorId !== userId && !isMod)
    throw new APIError(403, `User ${userId} must be a mod to unresolve.`)
}

const undoResolution = async (
  contract: Contract,
  userId: string,
  answerId?: string
) => {
  const pg = createSupabaseDirectClient()
  const contractId = contract.id
  // spice payouts
  const maxSpicePayoutStartTime = await pg.oneOrNone(
    `select max((data->'data'->'payoutStartTime')::numeric) as max
      FROM txns WHERE category = 'CONTRACT_RESOLUTION_PAYOUT'
      AND from_type = 'CONTRACT'
      AND from_id = $1
      and ($2 is null or data ->'data'->>'answerId' = $2)`,
    [contractId, answerId],
    (r) => r?.max as number | undefined
  )
  const spiceTxns = await pg.map(
    `SELECT * FROM txns WHERE category = 'PRODUCE_SPICE'
      AND from_type = 'CONTRACT'
      AND from_id = $1
      and ($2 is null or (data->'data'->>'payoutStartTime')::numeric = $2)
      and ($3 is null or data ->'data'->>'answerId' = $3)`,
    [contractId, maxSpicePayoutStartTime, answerId],
    (r) => r.data as ContractProduceSpiceTxn
  )

  log('Reverting spice txns ' + spiceTxns.length)
  log('With max payout start time ' + maxSpicePayoutStartTime)
  const chunkedTxns = chunk(spiceTxns, 250)
  for (const chunk of chunkedTxns) {
    const balanceUpdates: any[] = []
    const txns: TxnData[] = []

    for (const txnToRevert of chunk) {
      const { balanceUpdate, txn } = getUndoContractPayoutSpice(txnToRevert)
      balanceUpdates.push(balanceUpdate)
      txns.push(txn)
    }

    await pg.tx(async (tx) => {
      await bulkIncrementBalances(tx, balanceUpdates)
      await insertTxns(tx, txns)
    })
  }

  log('reverted txns')

  // old payouts
  const maxManaPayoutStartTime = await pg.oneOrNone(
    `select max((data->'data'->'payoutStartTime')::numeric) as max
      FROM txns WHERE category = 'CONTRACT_RESOLUTION_PAYOUT'
      AND from_type = 'CONTRACT'
      AND from_id = $1
      and ($2 is null or data ->'data'->>'answerId' = $2)`,
    [contractId, answerId],
    (r) => r?.max as number | undefined
  )
  const manaTxns = await pg.map(
    `SELECT * FROM txns WHERE category = 'CONTRACT_RESOLUTION_PAYOUT'
      AND from_type = 'CONTRACT'
      AND from_id = $1
      and ($2 is null or (data->'data'->>'payoutStartTime')::numeric = $2)
      and ($3 is null or data ->'data'->>'answerId' = $3)`,
    [contractId, maxSpicePayoutStartTime, answerId],
    (r) => r.data as ContractOldResolutionPayoutTxn
  )

  log('Reverting mana txns ' + manaTxns.length)
  log('With max payout start time ' + maxManaPayoutStartTime)
  const chunkedManaTxns = chunk(manaTxns, 250)
  for (const chunk of chunkedManaTxns) {
    const balanceUpdates: any[] = []
    const txns: TxnData[] = []

    for (const txnToRevert of chunk) {
      const { balanceUpdate, txn } = getUndoOldContractPayout(txnToRevert)
      balanceUpdates.push(balanceUpdate)
      txns.push(txn)
    }

    await pg.tx(async (tx) => {
      await bulkIncrementBalances(tx, balanceUpdates)
      await insertTxns(tx, txns)
    })
  }

  log('reverted txns')

  if (contract.isResolved || contract.resolutionTime) {
    const updatedAttrs = {
      isResolved: false,
      resolutionTime: admin.firestore.FieldValue.delete(),
      resolution: admin.firestore.FieldValue.delete(),
      resolutions: admin.firestore.FieldValue.delete(),
      resolutionProbability: admin.firestore.FieldValue.delete(),
      closeTime: Date.now(),
    }
    await firestore.doc(`contracts/${contractId}`).update(updatedAttrs)
    await recordContractEdit(contract, userId, Object.keys(updatedAttrs))
  }
  if (contract.mechanism === 'cpmm-multi-1' && !answerId) {
    const updatedAttrs = {
      resolutionTime: admin.firestore.FieldValue.delete(),
      resolverId: admin.firestore.FieldValue.delete(),
    }
    for (const answer of contract.answers) {
      const answerDoc = firestore.doc(
        `contracts/${contractId}/answersCpmm/${answer.id}`
      )
      await answerDoc.update(updatedAttrs)
    }
  } else if (answerId) {
    const updatedAttrs = {
      resolution: admin.firestore.FieldValue.delete(),
      resolutionTime: admin.firestore.FieldValue.delete(),
      resolutionProbability: admin.firestore.FieldValue.delete(),
      resolverId: admin.firestore.FieldValue.delete(),
    }
    await firestore
      .doc(`contracts/${contractId}/answersCpmm/${answerId}`)
      .update(updatedAttrs)
  }

  log('updated contract')
}

export function getUndoContractPayoutSpice(txnData: ContractProduceSpiceTxn) {
  const { amount, toId, data, fromId, id } = txnData
  const { deposit } = data ?? {}

  const balanceUpdate = {
    spiceBalance: -amount,
    totalDeposits: -(deposit ?? 0),
  }

  const txn: Omit<ContractUndoProduceSpiceTxn, 'id' | 'createdTime'> = {
    amount: amount,
    toId: fromId,
    fromType: 'USER',
    fromId: toId,
    toType: 'CONTRACT',
    category: 'CONTRACT_UNDO_PRODUCE_SPICE',
    token: 'SPICE',
    description: `Undo contract resolution payout from contract ${fromId}`,
    data: { revertsTxnId: id },
  }
  return { balanceUpdate, txn }
}

export function getUndoOldContractPayout(
  txnData: ContractOldResolutionPayoutTxn
) {
  const { amount, toId, data, fromId, id } = txnData
  const { deposit } = data ?? {}

  const balanceUpdate = {
    balance: -amount,
    totalDeposits: -(deposit ?? 0),
  }

  const txn: Omit<ContractUndoOldResolutionPayoutTxn, 'id' | 'createdTime'> = {
    amount: amount,
    toId: fromId,
    fromType: 'USER',
    fromId: toId,
    toType: 'CONTRACT',
    category: 'CONTRACT_UNDO_RESOLUTION_PAYOUT',
    token: 'M$',
    description: `Undo contract resolution payout from contract ${fromId}`,
    data: { revertsTxnId: id },
  }
  return { balanceUpdate, txn }
}
