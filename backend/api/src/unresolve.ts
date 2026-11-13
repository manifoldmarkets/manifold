import { isEqual } from 'lodash'

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

// How far the database's clock, which stamped the contract edit of a
// resolution made before edits were keyed, may run behind the API's, which
// stamped its resolutionTime.
const RESOLUTION_EDIT_CLOCK_SKEW_MS = 10 * 1000

// The contract edit a resolution recorded: the market as it found it.
type ResolutionEdit = {
  id: number
  subsidy_pool: number | null
  answers: Partial<Answer>[] | null
  idempotency_key: string | null
  recorded_time: number
}

const RESOLUTION_EDIT_COLUMNS = `id,
  (data->>'subsidyPool')::numeric as subsidy_pool,
  case when jsonb_typeof(data->'answers') = 'array'
    then data->'answers' end as answers,
  idempotency_key,
  (extract(epoch from created_time) * 1000)::float8 as recorded_time`

// The contract edit recorded by the resolution being undone, which holds the
// pending subsidy that resolution took: the market's pool, and each answer's
// own. Only that edit says what to put back. Any other is another
// resolution's, and the subsidy it holds has been paid out or has drizzled
// into the pools since: restoring from it counts that subsidy twice.
//
// A resolution records its edit in its own transaction, under a key that
// names it (getResolutionEditKey), and that is the edit looked up here.
//
// Resolutions made before that recorded theirs unkeyed, after committing, so
// theirs can be missing, and nothing on an edit says which resolution it is.
// For those, the latest edit recorded while the market (and the answer, if
// one is being unresolved) was unresolved is taken to be theirs if it is
// unkeyed and was recorded no earlier than the resolution: resolutionTime was
// set inside the resolving transaction and the edit recorded once it
// committed, so an earlier resolution's predates it. That is how every
// restore was read before, with the time check added, and it can still be
// another resolution's from the seconds before. So it is used only for a
// resolution too old for its creator to undo: everything anyone but a
// moderator can unresolve is restored from its own keyed edit, or not at all.
const getResolutionEdit = async (
  pg: SupabaseTransaction,
  contractId: string,
  resolutionTime: number,
  answerId: string | undefined
) => {
  const keyed = await pg.oneOrNone<ResolutionEdit>(
    `select ${RESOLUTION_EDIT_COLUMNS}
    from contract_edits
    where contract_id = $1
      and idempotency_key = $2
    order by created_time desc
    limit 1`,
    [contractId, getResolutionEditKey(answerId, resolutionTime)]
  )
  if (keyed) return keyed

  if (resolutionTime >= Date.now() - MINUTES_ALLOWED_TO_UNRESOLVE * MINUTE_MS)
    return null

  const latest = await pg.oneOrNone<ResolutionEdit>(
    `select ${RESOLUTION_EDIT_COLUMNS}
    from contract_edits
    where contract_id = $1
      and 'subsidyPool' = any(updated_keys)
      and coalesce((data->>'isResolved')::boolean, false) = false
      and ($2::text is null or exists (
        select 1
        from jsonb_array_elements(
          case when jsonb_typeof(data->'answers') = 'array'
            then data->'answers' else '[]'::jsonb end
        ) as answer_data
        where answer_data->>'id' = $2
          and answer_data->>'resolution' is null
      ))
    order by created_time desc
    limit 1`,
    [contractId, answerId ?? null]
  )
  return latest &&
    latest.idempotency_key == null &&
    latest.recorded_time >= resolutionTime - RESOLUTION_EDIT_CLOCK_SKEW_MS
    ? latest
    : null
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
    [contractId, maxManaPayoutStartTime, answerId],
    (r) => convertTxn(r) as ContractOldResolutionPayoutTxn
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

  const edit = await getResolutionEdit(pg, contractId, resolutionTime, answerId)
  // As resolveMarketHelper counted them when it split the market's pool.
  const openAnswerIds = (edit?.answers ?? []).flatMap((a) =>
    a.id && !a.resolutionTime ? [a.id] : []
  )
  const marketResolved = !!(contract.isResolved || contract.resolutionTime)
  // As read when this transaction began; only for telling open pages.
  const marketPool =
    'subsidyPool' in contract ? positiveOrZero(contract.subsidyPool) : 0

  // What unresolving one answer of an independent market puts back into the
  // market's pending subsidy pool. Its resolution took an equal share of the
  // pool with the answers open then (resolveMarketHelper), paid it out, and
  // those payouts have just been taken back: that share goes back, whether or
  // not the market has resolved since.
  //
  // Not the pool as the last answer to resolve found it, which is what was
  // restored whenever the market was resolved, whichever answer was being
  // unresolved. That returned to the pool what the last answer's payout,
  // still standing, had paid out, for the reopened answer to pay out again
  // (resolve A, add a subsidy, resolve B, unresolve A, resolve A).
  //
  // A resolution from before edits were keyed has its share put back only
  // where it is certain: it was the answer its edit shows as the one still
  // open, which took the whole pool and resolved the market.
  let marketPoolShare = 0
  if (answerId !== undefined && edit) {
    if (edit.idempotency_key != null) {
      if (openAnswerIds.includes(answerId))
        marketPoolShare = positiveOrZero(
          (edit.subsidy_pool ?? 0) / openAnswerIds.length
        )
    } else if (marketResolved && isEqual(openAnswerIds, [answerId])) {
      marketPoolShare = positiveOrZero(edit.subsidy_pool)
    }
  }
  if (!edit) {
    log(
      'No contract edit for the resolution being undone: restoring no subsidy',
      {
        contractId,
        answerId,
        resolutionTime,
      }
    )
  }

  if (marketResolved) {
    // A whole market (binary, linked) gets its pool back as the resolution
    // found it. An independent market gets the answer's share added to
    // whatever is there (nothing, unless a subsidy came in while it was
    // resolved).
    const subsidyPool =
      answerId === undefined
        ? positiveOrZero(edit?.subsidy_pool)
        : marketPool + marketPoolShare
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
      subsidyPool:
        answerId === undefined
          ? subsidyPool
          : marketPoolShare > 0
          ? FieldVal.increment(marketPoolShare)
          : undefined,
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
      ...(answerId === undefined || marketPoolShare > 0 ? { subsidyPool } : {}),
    }
  } else if (marketPoolShare > 0) {
    // The market is still open and its pool in use: add the share to it.
    await updateContract(pg, contractId, {
      subsidyPool: FieldVal.increment(marketPoolShare),
    })
    contractWebsocketUpdates = {
      subsidyPool: marketPool + marketPoolShare,
    }
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
    // answers in the contract, and restore subsidyPool. The broadcast below
    // clears them on open pages too.
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
        subsidy_pool = coalesce(
          (select (answer_data->>'subsidyPool')::numeric
           from pre_resolution_answers
           where answer_data->>'id' = answers.id),
          0
        )
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
    // out, from the edit that resolution recorded (getResolutionEdit).
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
        subsidy_pool = $3
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
