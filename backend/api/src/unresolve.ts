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
import { log } from 'shared/utils'
import { MINUTE_MS } from 'common/util/time'
import { Contract, MINUTES_ALLOWED_TO_UNRESOLVE } from 'common/contract'
import { recordContractEdit } from 'shared/record-contract-edit'
import { isAdminId, isModId } from 'common/envs/constants'
import { TxnData, insertTxns } from 'shared/txn/run-txn'
import { setAdjustProfitFromResolvedMarkets } from 'shared/helpers/user-contract-metrics'
import { bulkIncrementBalances } from 'shared/supabase/users'
import { betsQueue } from 'shared/helpers/fn-queue'
import { assert } from 'common/util/assert'
import { broadcastUpdatedAnswer } from 'shared/websockets/helpers'
import { convertAnswer } from 'common/supabase/contracts'

const firestore = admin.firestore()

const TXNS_PR_MERGED_ON = 1675693800000 // #PR 1476

export const unresolve: APIHandler<'unresolve'> = async (
  props,
  auth,
  request
) => {
  return await betsQueue.enqueueFnFirst(
    () => unresolveMain(props, auth, request),
    [props.contractId, auth.uid]
  )
}

const unresolveMain: APIHandler<'unresolve'> = async (props, auth) => {
  const { contractId, answerId } = props

  // Fetch fresh contract & verify within lock.
  const contractSnap = await firestore
    .collection('contracts')
    .doc(contractId)
    .get()
  const contract = contractSnap.data() as Contract
  if (!contract) throw new APIError(404, `Contract ${contractId} not found`)

  await verifyUserCanUnresolve(contract, auth.uid, answerId)

  await trackPublicEvent(auth.uid, 'unresolve market', {
    contractId,
  })
  await undoResolution(contract, auth.uid, answerId)

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

  const { creatorId, mechanism } = contract

  let resolutionTime: number
  if (
    mechanism === 'cpmm-1' ||
    (mechanism === 'cpmm-multi-1' && contract.shouldAnswersSumToOne)
  ) {
    if (answerId !== undefined) {
      throw new APIError(
        400,
        `Specifying answerId is not allowed for unresolving this contract`
      )
    }
    if (!contract.isResolved || !contract.resolutionTime)
      throw new APIError(400, `Contract ${contract.id} is not resolved`)

    resolutionTime = contract.resolutionTime
  } else {
    // Is independent multi.
    assert(
      mechanism === 'cpmm-multi-1' && !contract.shouldAnswersSumToOne,
      'Invalid contract mechanism'
    )

    if (!answerId) {
      throw new APIError(
        400,
        `answerId is required for cpmm-multi-1 contracts with shouldAnswersSumToOne = false`
      )
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

    resolutionTime = answerResolutionTime
  }

  if (resolutionTime < TXNS_PR_MERGED_ON)
    throw new APIError(
      400,
      `Contract ${contract.id} was resolved before payouts were unresolvable transactions.`
    )

  if (
    !isMod &&
    creatorId === userId &&
    resolutionTime < Date.now() - MINUTES_ALLOWED_TO_UNRESOLVE * MINUTE_MS
  ) {
    throw new APIError(
      400,
      `${
        answerId ? 'Answer' : 'Contract'
      } was resolved more than ${MINUTES_ALLOWED_TO_UNRESOLVE} minutes ago.`
    )
  }

  if (creatorId === userId && !isMod) {
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

  if (creatorId !== userId && !isMod)
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
    const balanceUpdates: {
      balance: number
      totalDeposits: number
      id: string
    }[] = []
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
    // remove resolutionTime and resolverId from all answers in the contract
    const newAnswers = await pg.map(
      `update answers
      set data = data - 'resolutionTime' - 'resolverId'
      where contract_id = $1
      returning *`,
      [contractId],
      convertAnswer
    )
    newAnswers.forEach((ans) => broadcastUpdatedAnswer(contract, ans))
  } else if (answerId) {
    const answer = await pg.one(
      `update answers
      set data = data - '{resolution,resolutionTime,resolutionProbability,resolverId}'::text[]
      where id = $1
      returning *`,
      [answerId],
      convertAnswer
    )
    broadcastUpdatedAnswer(contract, answer)
  }

  log('updated contract')
}

export function getUndoContractPayoutSpice(txnData: ContractProduceSpiceTxn) {
  const { amount, toId, data, fromId, id } = txnData
  const { deposit } = data ?? {}

  const balanceUpdate = {
    spiceBalance: -amount,
    totalDeposits: -(deposit ?? 0),
    id: toId,
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
    id: toId,
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
