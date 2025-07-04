import {
  ContractOldResolutionPayoutTxn,
  ContractProduceSpiceTxn,
  ContractUndoOldResolutionPayoutTxn,
  ContractUndoProduceSpiceTxn,
  ProfitFeeTxn,
  UndoResolutionFeeTxn,
} from 'common/txn'
import {
  SupabaseTransaction,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { APIError, APIHandler } from 'api/helpers/endpoint'
import { trackPublicEvent } from 'shared/analytics'
import { getContract, isProd, log } from 'shared/utils'
import { MINUTE_MS } from 'common/util/time'
import { Contract, MINUTES_ALLOWED_TO_UNRESOLVE } from 'common/contract'
import { recordContractEdit } from 'shared/record-contract-edit'
import { isAdminId, isModId } from 'common/envs/constants'
import { TxnData, insertTxns } from 'shared/txn/run-txn'
import { bulkIncrementBalances } from 'shared/supabase/users'
import { betsQueue } from 'shared/helpers/fn-queue'
import { assert } from 'common/util/assert'
import { broadcastUpdatedAnswers } from 'shared/websockets/helpers'
import { convertAnswer } from 'common/supabase/contracts'
import { updateContract } from 'shared/supabase/contracts'
import { FieldVal } from 'shared/supabase/utils'
import { convertTxn } from 'common/supabase/txns'
import { HOUSE_LIQUIDITY_PROVIDER_ID } from 'common/antes'
import { getCpmmProbability } from 'common/calculate-cpmm'
import { removeUndefinedProps } from 'common/util/object'
import {
  bulkUpdateContractMetrics,
  getContractMetricsForContract,
} from 'shared/helpers/user-contract-metrics'

const TXNS_PR_MERGED_ON = 1675693800000 // #PR 1476

export const unresolve: APIHandler<'unresolve'> = async (
  props,
  auth,
  request
) => {
  return await betsQueue.enqueueFn(
    () => unresolveMain(props, auth, request),
    [props.contractId, auth.uid]
  )
}

export const unresolveMain: APIHandler<'unresolve'> = async (props, auth) => {
  const { contractId, answerId } = props

  const result = await createSupabaseDirectClient().tx(async (tx) => {
    const contract = await getContract(tx, contractId)
    if (!contract) throw new APIError(404, `Contract ${contractId} not found`)

    await verifyUserCanUnresolve(tx, contract, auth.uid, answerId)

    await undoResolution(tx, contract, auth.uid, answerId)

    return { success: true as const }
  })

  await trackPublicEvent(auth.uid, 'unresolve market', {
    contractId,
  })

  return result
}

const verifyUserCanUnresolve = async (
  pg: SupabaseTransaction,
  contract: Contract,
  userId: string,
  answerId?: string
) => {
  const isMod = isModId(userId) || isAdminId(userId)

  const { creatorId, mechanism, isSpicePayout, token } = contract

  if (isSpicePayout) {
    throw new APIError(400, `We no longer allow pp markets to be unresolved`)
  }

  if (isProd() && token === 'CASH' && userId !== HOUSE_LIQUIDITY_PROVIDER_ID) {
    throw new APIError(
      403,
      `Only the Manifold account can unresolve sweepcash markets`
    )
  }

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
      `select ts_to_millis(resolution_time) as resolution_time
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
  pg: SupabaseTransaction,
  contract: Contract,
  userId: string,
  answerId?: string
) => {
  const contractId = contract.id
  // Spice payouts:
  const maxSpicePayoutStartTime = await pg.oneOrNone(
    `select max((data->'data'->'payoutStartTime')::numeric) as max
      FROM txns WHERE category = 'CONTRACT_RESOLUTION_PAYOUT'
      AND from_type = 'CONTRACT'
      AND from_id = $1
      and ($2 is null or data ->'data'->>'answerId' = $2)`,
    [contractId, answerId],
    (r) => r?.max as number | undefined
  )
  const spiceTxnsToRevert = await pg.map(
    `SELECT * FROM txns WHERE category = 'PRODUCE_SPICE'
      AND from_type = 'CONTRACT'
      AND from_id = $1
      and ($2 is null or (data->'data'->>'payoutStartTime')::numeric = $2)
      and ($3 is null or data ->'data'->>'answerId' = $3)`,
    [contractId, maxSpicePayoutStartTime, answerId],
    (r) => convertTxn(r) as ContractProduceSpiceTxn
  )

  log('Reverting spice txns ' + spiceTxnsToRevert.length)
  log('With max payout start time ' + maxSpicePayoutStartTime)
  const spiceBalanceUpdates: {
    spiceBalance: number
    totalDeposits: number
    id: string
  }[] = []
  const spiceTxns: TxnData[] = []

  for (const txnToRevert of spiceTxnsToRevert) {
    const { balanceUpdate, txn } = getUndoContractPayoutSpice(txnToRevert)
    spiceBalanceUpdates.push(balanceUpdate)
    spiceTxns.push(txn)
  }

  await bulkIncrementBalances(pg, spiceBalanceUpdates)
  await insertTxns(pg, spiceTxns)

  log('reverted txns')

  // mana and cash payouts
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
    (r) => convertTxn(r) as ContractOldResolutionPayoutTxn
  )

  // Get resolution fee txns to revert
  const feeTxns = await pg.map(
    `SELECT * FROM txns WHERE category = 'CONTRACT_RESOLUTION_FEE'
      AND from_type = 'USER'
      AND data->'data'->>'contractId' = $1
      and ($2 is null or (data->'data'->>'payoutStartTime')::numeric = $2)
      and ($3 is null or data ->'data'->>'answerId' = $3)`,
    [contractId, maxManaPayoutStartTime, answerId],
    (r) => convertTxn(r) as ProfitFeeTxn
  )

  log('Reverting mana txns ' + manaTxns.length)
  log('Reverting fee txns ' + feeTxns.length)
  log('With max payout start time ' + maxManaPayoutStartTime)
  const balanceUpdates: {
    balance?: number
    cashBalance?: number
    totalDeposits: number
    totalCashDeposits: number
    id: string
  }[] = []
  const txns: TxnData[] = []

  for (const txnToRevert of manaTxns) {
    const { balanceUpdate, txn } = getUndoOldContractPayout(txnToRevert)
    balanceUpdates.push(balanceUpdate as any)
    txns.push(txn)
  }

  // Revert fee txns
  for (const txnToRevert of feeTxns) {
    const { balanceUpdate, txn } = getUndoResolutionFee(txnToRevert)
    balanceUpdates.push(balanceUpdate as any)
    txns.push(txn)
  }

  await bulkIncrementBalances(pg, balanceUpdates)
  await insertTxns(pg, txns)

  log('reverted txns')

  if (contract.isResolved || contract.resolutionTime) {
    const updatedAttrs = removeUndefinedProps({
      isResolved: false,
      resolutionTime: FieldVal.delete(),
      resolverId: FieldVal.delete(),
      resolution: FieldVal.delete(),
      resolutions: FieldVal.delete(),
      resolutionProbability: FieldVal.delete(),
      closeTime: Date.now(),
      prob:
        contract.mechanism === 'cpmm-1'
          ? getCpmmProbability(contract.pool, contract.p)
          : undefined,
    })
    await updateContract(pg, contractId, updatedAttrs)
    await recordContractEdit(contract, userId, Object.keys(updatedAttrs))
  }
  if (!answerId) {
    const contractMetrics = await getContractMetricsForContract(
      pg,
      contract.id,
      null
    )
    const updateMetrics = contractMetrics.map((metric) => ({
      ...metric,
      profit: metric.previousProfit ?? metric.profit,
    }))
    await bulkUpdateContractMetrics(updateMetrics, pg)
  }
  if (contract.mechanism === 'cpmm-multi-1' && !answerId) {
    // remove resolutionTime and resolverId from all answers in the contract
    const newAnswers = await pg.map(
      `
      with last_bet as (
        select distinct on (answer_id) answer_id, prob_after from contract_bets
        where contract_id = $1
        order by answer_id, created_time desc
      )
      update answers
      set
        resolution_time = null,
        resolver_id = null,
        prob = coalesce(last_bet.prob_after,0.5)
      from last_bet
      where answers.id = last_bet.answer_id
      returning *`,
      [contractId],
      convertAnswer
    )
    broadcastUpdatedAnswers(contractId, newAnswers)
  } else if (answerId) {
    const contractMetrics = await getContractMetricsForContract(
      pg,
      contract.id,
      [answerId]
    )
    const updateMetrics = contractMetrics.map((metric) => ({
      ...metric,
      profit: metric.previousProfit ?? metric.profit,
    }))
    await bulkUpdateContractMetrics(updateMetrics, pg)
    const answer = await pg.one(
      `
      update answers
      set
        resolution = null,
        resolution_time = null,
        resolution_probability = null,
        prob = coalesce(
          (select prob_after 
           from contract_bets 
           where answer_id = $1 
           and contract_id = $2
           order by created_time desc 
           limit 1),
          0.5
        ),
        resolver_id = null
      where id = $1
      returning *`,
      [answerId, contractId],
      convertAnswer
    )
    broadcastUpdatedAnswers(contractId, [answer])
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
  const { amount, toId, data, fromId, id, token } = txnData
  const { deposit } = data ?? {}

  const balanceUpdate = {
    [token === 'CASH' ? 'cashBalance' : 'balance']: -amount,
    [token === 'CASH' ? 'totalCashDeposits' : 'totalDeposits']: -(deposit ?? 0),
    id: toId,
  }

  const txn: Omit<ContractUndoOldResolutionPayoutTxn, 'id' | 'createdTime'> = {
    amount: amount,
    toId: fromId,
    fromType: 'USER',
    fromId: toId,
    toType: 'CONTRACT',
    category: 'CONTRACT_UNDO_RESOLUTION_PAYOUT',
    token,
    description: `Undo contract resolution payout from contract ${fromId}`,
    data: { revertsTxnId: id },
  }
  return { balanceUpdate, txn }
}

export function getUndoResolutionFee(txnData: ProfitFeeTxn) {
  const { amount, fromId, id, token, data } = txnData

  const balanceUpdate = {
    [token === 'CASH' ? 'cashBalance' : 'balance']: -amount,
    [token === 'CASH' ? 'totalCashDeposits' : 'totalDeposits']: 0,
    id: fromId,
  }

  const txn: Omit<UndoResolutionFeeTxn, 'id' | 'createdTime'> = {
    amount: amount,
    toId: fromId,
    fromType: 'BANK',
    fromId: txnData.toId,
    toType: 'USER',
    category: 'UNDO_CONTRACT_RESOLUTION_FEE',
    token,
    description: `Undo contract resolution fee`,
    data: { revertsTxnId: id, contractId: data.contractId },
  }
  return { balanceUpdate, txn }
}
