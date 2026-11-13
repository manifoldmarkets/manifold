import { APIError, APIHandler } from 'api/helpers/endpoint'
import { onlyUsersWhoCanPerformAction } from 'api/helpers/rate-limit'
import { HOUSE_LIQUIDITY_PROVIDER_ID } from 'common/antes'
import { Answer } from 'common/answer'
import { getCpmmProbability } from 'common/calculate-cpmm'
import {
  Contract,
  MINUTES_ALLOWED_TO_UNRESOLVE,
  isMultiCpmm,
} from 'common/contract'
import { isAdminId, isModId } from 'common/envs/constants'
import { convertAnswer } from 'common/supabase/contracts'
import { convertTxn } from 'common/supabase/txns'
import {
  ContractOldResolutionPayoutTxn,
  ContractUndoOldResolutionPayoutTxn,
} from 'common/txn'
import { assert } from 'common/util/assert'
import { removeUndefinedProps } from 'common/util/object'
import { MINUTE_MS } from 'common/util/time'
import { trackPublicEvent } from 'shared/analytics'
import { betsQueue } from 'shared/helpers/fn-queue'
import { getUser } from 'shared/utils'
import {
  bulkUpdateContractMetrics,
  getContractMetricsForContract,
} from 'shared/helpers/user-contract-metrics'
import { recordContractEdit } from 'shared/record-contract-edit'
import { getResolutionEditKey } from 'shared/resolution-edit-key'
import { checkForNegativeBalancesAndPayouts } from 'shared/resolve-market-helpers'
import { updateContract } from 'shared/supabase/contracts'
import {
  SupabaseTransaction,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { UserUpdate, bulkIncrementBalancesQuery } from 'shared/supabase/users'
import { FieldVal } from 'shared/supabase/utils'
import { TxnData, insertTxns } from 'shared/txn/run-txn'
import { getContract, isProd, log } from 'shared/utils'
import {
  broadcastUpdatedAnswers,
  broadcastUpdatedContract,
} from 'shared/websockets/helpers'

const TXNS_PR_MERGED_ON = 1675693800000 // #PR 1476

// The contract edit a resolution recorded: the market as it found it.
type ResolutionEdit = {
  id: number
  subsidy_pool: number | null
  answers: Partial<Answer>[] | null
}

// The contract edit recorded by the resolution being undone, which holds the
// pending subsidy that resolution took: the market's pool, and each answer's
// own. Only that edit says what to put back. Any other is another
// resolution's, and the subsidy it holds has been paid out or has drizzled
// into the pools since: restoring from it counts that subsidy twice.
//
// A resolution records it in its own transaction, under a key that names it
// (getResolutionEditKey), and that is the edit looked up here.
//
// A resolution made before that has none. Its edit was recorded unkeyed,
// after it committed, so it can be missing, and nothing on an unkeyed edit
// says which resolution it is: the latest on file can be another answer's,
// or the same one's from before an earlier unresolve. Unresolving used to
// restore from whichever was latest. For such a resolution it now restores
// nothing.
const getResolutionEdit = (
  pg: SupabaseTransaction,
  contractId: string,
  resolutionTime: number,
  answerId: string | undefined
) =>
  pg.oneOrNone<ResolutionEdit>(
    `select id,
      (data->>'subsidyPool')::numeric as subsidy_pool,
      case when jsonb_typeof(data->'answers') = 'array'
        then data->'answers' end as answers
    from contract_edits
    where contract_id = $1
      and idempotency_key = $2
    order by created_time desc
    limit 1`,
    [contractId, getResolutionEditKey(answerId, resolutionTime)]
  )

// A payout already taken back by an earlier unresolve.
const PAYOUT_NOT_REVERTED = `
  coalesce((txns.data->'data'->>'reverted')::boolean, false) = false
  and not exists (
    select 1 from txns undo
    where undo.category = 'CONTRACT_UNDO_RESOLUTION_PAYOUT'
      and undo.to_id = $1
      and undo.data->'data'->>'revertsTxnId' = txns.id
  )`

// The payouts of the resolution being undone, to take back.
//
// A resolution that recorded its edit also recorded its resolutionTime on each
// payout, in the same transaction: those are its payouts, all of them, and
// possibly none.
//
// An older one's are taken to be the latest batch paid for the answer or
// market that hasn't been taken back, by the time stamped on it when the
// payouts were built, as they always were, but for that check. Without it, a
// resolution that paid nothing, or whose resolver's clock ran behind an
// earlier one's, had the previous resolution's payouts taken back a second
// time while its own stood.
const getPayoutsToUndo = async (
  pg: SupabaseTransaction,
  contractId: string,
  resolutionTime: number,
  answerId: string | undefined,
  recordedByResolution: boolean
) => {
  if (recordedByResolution)
    return pg.map(
      `select * from txns
      where category = 'CONTRACT_RESOLUTION_PAYOUT'
        and from_type = 'CONTRACT'
        and from_id = $1
        and (data->'data'->>'resolutionTime')::numeric = $2
        and ($3 is null or data->'data'->>'answerId' = $3)
        and ${PAYOUT_NOT_REVERTED}`,
      [contractId, resolutionTime, answerId],
      (r) => convertTxn(r) as ContractOldResolutionPayoutTxn
    )

  const payoutStartTime = await pg.oneOrNone(
    `select max((data->'data'->'payoutStartTime')::numeric) as max
    from txns
    where category = 'CONTRACT_RESOLUTION_PAYOUT'
      and from_type = 'CONTRACT'
      and from_id = $1
      and ($2 is null or data->'data'->>'answerId' = $2)
      and ${PAYOUT_NOT_REVERTED}`,
    [contractId, answerId],
    (r) => r?.max as number | null | undefined
  )
  log('Reverting payouts with payout start time ' + payoutStartTime)
  if (payoutStartTime == null) return []
  return pg.map(
    `select * from txns
    where category = 'CONTRACT_RESOLUTION_PAYOUT'
      and from_type = 'CONTRACT'
      and from_id = $1
      and (data->'data'->>'payoutStartTime')::numeric = $2
      and ($3 is null or data->'data'->>'answerId' = $3)
      and ${PAYOUT_NOT_REVERTED}`,
    [contractId, payoutStartTime, answerId],
    (r) => convertTxn(r) as ContractOldResolutionPayoutTxn
  )
}

const positiveOrZero = (amount: number | null | undefined) =>
  amount != null && Number.isFinite(amount) && amount > 0 ? amount : 0

export const unresolve: APIHandler<'unresolve'> = onlyUsersWhoCanPerformAction(
  'resolveMarket',
  async (props, auth, request) => {
    return await betsQueue.enqueueFn(
      () => unresolveMain(props, auth, request),
      [props.contractId, auth.uid]
    )
  }
)

export const unresolveMain: APIHandler<'unresolve'> = async (props, auth) => {
  const { contractId, answerId } = props

  const result = await createSupabaseDirectClient().tx(async (tx) => {
    // One unresolve of a market at a time, and no resolution of it meanwhile.
    // This reads the market, then takes back the payouts of the resolution it
    // found and puts back what that resolution took. The queue in unresolve()
    // orders only the calls this process receives: without the lock, another
    // process could unresolve the market and resolve it again in between, and
    // this would take back one resolution's payouts and restore another's
    // subsidy, or take the same payouts back twice. A resolution writes this
    // row, so it waits for this transaction and then fails to serialize.
    await tx.oneOrNone(`select 1 from contracts where id = $1 for update`, [
      contractId,
    ])
    const contract = await getContract(tx, contractId)
    if (!contract) throw new APIError(404, `Contract ${contractId} not found`)

    if (contract.outcomeType === 'PERP')
      throw new APIError(400, 'Perp markets cannot be unresolved')

    // A deleted market's page is unreachable, so unresolving one strands it
    // closed-and-unresolved with no way for the creator to resolve it again.
    if (contract.deleted)
      throw new APIError(403, 'Deleted markets cannot be unresolved')

    const resolutionTime = await verifyUserCanUnresolve(
      tx,
      contract,
      auth.uid,
      answerId
    )

    const undoResult = await undoResolution(
      tx,
      contract,
      auth.uid,
      resolutionTime,
      answerId
    )

    return {
      success: true as const,
      answerUpdates: undoResult.answerUpdates,
      contractWebsocketUpdates: undoResult.contractWebsocketUpdates,
      visibility: contract.visibility,
    }
  })

  if (result.answerUpdates.length > 0) {
    broadcastUpdatedAnswers(contractId, result.answerUpdates)
  }
  if (result.contractWebsocketUpdates) {
    broadcastUpdatedContract(result.visibility, {
      id: contractId,
      ...result.contractWebsocketUpdates,
    })
  }

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

  const user = await getUser(userId, pg)
  if (!user) throw new APIError(404, 'User not found')
  if (user.userDeleted) throw new APIError(403, 'Your account has been deleted')

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
  // Whole-market-only unresolve for binary and LINKED multi — the mirror of the routing gate
  // in resolve-market.ts. If cpmm-multi-2 per-answer NO resolution of linked answers ships
  // (reserved — see the CPMMMulti doc comment in common/src/contract.ts), this relaxes too.
  if (
    mechanism === 'cpmm-1' ||
    (isMultiCpmm(contract) && contract.shouldAnswersSumToOne)
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
      isMultiCpmm(contract) && !contract.shouldAnswersSumToOne,
      'Invalid contract mechanism'
    )

    if (!answerId) {
      throw new APIError(
        400,
        `answerId is required for cpmm-multi-1 contracts with shouldAnswersSumToOne = false`
      )
    }

    // Authorization, payout reversal and metrics are all scoped to this
    // contract, so the answer must belong to it too. Lock the row so it can't
    // be resolved or unresolved between this check and the update in
    // undoResolution.
    const answerResolutionTime = await pg.oneOrNone(
      `select ts_to_millis(resolution_time) as resolution_time
         from answers
         where id = $1
           and contract_id = $2
         limit 1
         for update`,
      [answerId, contract.id],
      (r) => (r?.resolution_time ?? null) as number | null
    )
    // Deliberately does not distinguish "no such answer on this contract" from
    // "not resolved", so this can't be used to probe other contracts' answers.
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

  return resolutionTime
}

const undoResolution = async (
  pg: SupabaseTransaction,
  contract: Contract,
  userId: string,
  // Of the resolution being undone: the answer's, or the market's.
  resolutionTime: number,
  answerId?: string
) => {
  const contractId = contract.id

  const edit = await getResolutionEdit(pg, contractId, resolutionTime, answerId)

  // mana and cash payouts
  const manaTxns = await getPayoutsToUndo(
    pg,
    contractId,
    resolutionTime,
    answerId,
    !!edit
  )

  // // Get resolution fee txns to revert
  // const feeTxns = await pg.map(
  //   `SELECT * FROM txns WHERE category = 'CONTRACT_RESOLUTION_FEE'
  //     AND from_type = 'USER'
  //     AND data->'data'->>'contractId' = $1
  //     and ($2 is null or (data->'data'->>'payoutStartTime')::numeric = $2)
  //     and ($3 is null or data ->'data'->>'answerId' = $3)`,
  //   [contractId, maxManaPayoutStartTime, answerId],
  //   (r) => convertTxn(r) as ProfitFeeTxn
  // )

  log('Reverting mana txns ' + manaTxns.length)
  // log('Reverting fee txns ' + feeTxns.length)
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

  // // Revert fee txns
  // for (const txnToRevert of feeTxns) {
  //   const { balanceUpdate, txn } = getUndoResolutionFee(txnToRevert)
  //   balanceUpdates.push(balanceUpdate as any)
  //   txns.push(txn)
  // }

  if (balanceUpdates.length > 0) {
    const balanceUpdatesQuery = bulkIncrementBalancesQuery(balanceUpdates)
    const userUpdates = await pg.many<UserUpdate>(balanceUpdatesQuery)
    if (!isAdminId(userId) && !isModId(userId)) {
      checkForNegativeBalancesAndPayouts(userUpdates, balanceUpdates)
    }
  }

  await insertTxns(pg, txns)

  log('reverted txns')

  let contractWebsocketUpdates: Partial<Contract> | undefined = undefined
  let answerUpdates: (Partial<Answer> & { id: string })[] = []

  // As resolveMarketHelper counted them when it split the market's pool.
  const openAnswerIds = (edit?.answers ?? []).flatMap((a) =>
    a.id && !a.resolutionTime ? [a.id] : []
  )
  const marketResolved = !!(contract.isResolved || contract.resolutionTime)
  // As read when this transaction began; only for telling open pages.
  const marketPool =
    'subsidyPool' in contract ? positiveOrZero(contract.subsidyPool) : 0

  // What goes back into the market's pending subsidy pool: what the
  // resolution being undone took of it and paid out, now that those payouts
  // have been taken back.
  //
  // A whole market (binary, linked) took all of it. One answer of an
  // independent market took an equal share with the answers open then
  // (resolveMarketHelper), and gets that share back whether or not the market
  // has resolved since. Not the pool as the last answer to resolve found it,
  // which is what was restored whenever the market was resolved, whichever
  // answer was being unresolved: that returned to the pool what the last
  // answer's payout, still standing, had paid out, for the reopened answer to
  // pay out again (resolve A, add a subsidy, resolve B, unresolve A, resolve
  // A). And while the market was still open, nothing was restored at all.
  //
  // The share returns to the pool the open answers share equally, so if
  // others have drizzled or resolved meanwhile, the reopened answer takes a
  // different share of it next time than the one it gave back. The total is
  // the same; how it divides between the answers' providers can differ.
  const marketPoolRestored = !edit
    ? 0
    : answerId === undefined
    ? positiveOrZero(edit.subsidy_pool)
    : openAnswerIds.includes(answerId)
    ? positiveOrZero((edit.subsidy_pool ?? 0) / openAnswerIds.length)
    : 0
  if (!edit) {
    log(
      'Unresolving a resolution that recorded no edit of its own: its payouts are taken back, no pending subsidy is restored',
      { contractId, answerId, resolutionTime }
    )
  }
  // Added to what the pool holds, not written over it: the resolution left
  // it empty, so anything there now came in since (a house subsidy does not
  // check that the market is open).
  const subsidyPoolUpdate =
    marketPoolRestored > 0
      ? { subsidyPool: FieldVal.increment(marketPoolRestored) }
      : {}
  const subsidyPoolForPages =
    marketPoolRestored > 0
      ? { subsidyPool: marketPool + marketPoolRestored }
      : {}

  if (marketResolved) {
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
      ...subsidyPoolUpdate,
    })
    await updateContract(pg, contractId, updatedAttrs)
    await recordContractEdit(contract, userId, Object.keys(updatedAttrs))
    contractWebsocketUpdates = {
      isResolved: false,
      resolutionTime: undefined,
      resolverId: undefined,
      resolution: undefined,
      resolutions: undefined,
      resolutionProbability: undefined,
      closeTime: Date.now(),
      prob:
        contract.mechanism === 'cpmm-1'
          ? getCpmmProbability(contract.pool, contract.p)
          : undefined,
      ...subsidyPoolForPages,
    }
  } else if (marketPoolRestored > 0) {
    await updateContract(pg, contractId, subsidyPoolUpdate)
    contractWebsocketUpdates = subsidyPoolForPages
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
  // A cpmm-multi-2 answer's probability can move without a bet (adding an
  // answer splits Other's), so its last bet can be stale, or missing. Resolution
  // leaves the pools as they were, so restore its probability from them. A
  // cpmm-multi-1 answer is restored from its last bet, as before, and from its
  // pool where it has none (listed at creation and never traded): resolution
  // marked it resolved too, and it must be cleared with the rest.
  const isV2 = contract.mechanism === 'cpmm-multi-2'
  const poolProb = `(answers.p * answers.pool_no) / ((1 - answers.p) * answers.pool_yes + answers.p * answers.pool_no)`
  if (isMultiCpmm(contract) && !answerId) {
    // Remove resolutionTime, resolverId and resolutionProbability from all
    // answers in the contract, and give each back the pending subsidy the
    // resolution took from it, added to what it holds as for the market's.
    // The broadcast below clears them on open pages too.
    const newAnswers = await pg.map(
      `
      with last_bet as (
        select distinct on (answer_id) answer_id, prob_after from contract_bets
        where contract_id = $1
        order by answer_id, created_time desc
      ),
      -- The answers as the resolution being undone found them, in the edit it
      -- recorded (getResolutionEdit). No rows if there is none.
      pre_resolution_answers as (
        select jsonb_array_elements(data->'answers') as answer_data
        from contract_edits
        where id = $2
          and jsonb_typeof(data->'answers') = 'array'
      )
      update answers
      set
        resolution_time = null,
        resolver_id = null,
        resolution_probability = null,
        prob = ${
          isV2
            ? poolProb
            : `coalesce(
          (select prob_after from last_bet where last_bet.answer_id = answers.id),
          ${poolProb}
        )`
        },
        subsidy_pool = coalesce(answers.subsidy_pool, 0) + greatest(coalesce(
          (select (answer_data->>'subsidyPool')::numeric
           from pre_resolution_answers
           where answer_data->>'id' = answers.id),
          0
        ), 0)
      where answers.contract_id = $1
      returning *`,
      [contractId, edit?.id ?? null],
      convertAnswer
    )
    answerUpdates = newAnswers.map((answer) => ({
      ...answer,
      // Explicit nulls are required so websocket merge can clear old values.
      resolution: null as any,
      resolutionTime: null as any,
      resolutionProbability: null as any,
      resolverId: null as any,
    }))
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
    // The answer's own pending subsidy, as its resolution found it and paid it
    // out, from the edit that resolution recorded (getResolutionEdit), added
    // to what it holds as for the market's.
    const preResolutionSubsidyPool = positiveOrZero(
      edit?.answers?.find((a) => a.id === answerId)?.subsidyPool
    )
    const answer = await pg.one(
      `
      update answers
      set
        resolution = null,
        resolution_time = null,
        resolution_probability = null,
        prob = ${
          isV2
            ? poolProb
            : `coalesce(
          (select prob_after 
           from contract_bets 
           where answer_id = $1 
           and contract_id = $2
           order by created_time desc 
           limit 1),
          0.5
        )`
        },
        resolver_id = null,
        subsidy_pool = coalesce(subsidy_pool, 0) + $3
      where id = $1
        and contract_id = $2
      returning *`,
      [answerId, contractId, preResolutionSubsidyPool],
      convertAnswer
    )
    answerUpdates = [
      {
        ...answer,
        // Explicit nulls are required so websocket merge can clear old values.
        resolution: null as any,
        resolutionTime: null as any,
        resolutionProbability: null as any,
        resolverId: null as any,
      },
    ]
  }

  log('updated contract')
  return { answerUpdates, contractWebsocketUpdates }
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

// export function getUndoResolutionFee(txnData: ProfitFeeTxn) {
//   const { amount, fromId, id, token, data } = txnData

//   const balanceUpdate = {
//     [token === 'CASH' ? 'cashBalance' : 'balance']: -amount,
//     [token === 'CASH' ? 'totalCashDeposits' : 'totalDeposits']: 0,
//     id: fromId,
//   }

//   const txn: Omit<UndoResolutionFeeTxn, 'id' | 'createdTime'> = {
//     amount: amount,
//     toId: fromId,
//     fromType: 'BANK',
//     fromId: txnData.toId,
//     toType: 'USER',
//     category: 'UNDO_CONTRACT_RESOLUTION_FEE',
//     token,
//     description: `Undo contract resolution fee`,
//     data: { revertsTxnId: id, contractId: data.contractId },
//   }
//   return { balanceUpdate, txn }
// }

// export function getUndoContractPayoutSpice(txnData: ContractProduceSpiceTxn) {
//   const { amount, toId, data, fromId, id } = txnData
//   const { deposit } = data ?? {}

//   const balanceUpdate = {
//     spiceBalance: -amount,
//     totalDeposits: -(deposit ?? 0),
//     id: toId,
//   }

//   const txn: Omit<ContractUndoProduceSpiceTxn, 'id' | 'createdTime'> = {
//     amount: amount,
//     toId: fromId,
//     fromType: 'USER',
//     fromId: toId,
//     toType: 'CONTRACT',
//     category: 'CONTRACT_UNDO_PRODUCE_SPICE',
//     token: 'SPICE',
//     description: `Undo contract resolution payout from contract ${fromId}`,
//     data: { revertsTxnId: id },
//   }
//   return { balanceUpdate, txn }
// }
