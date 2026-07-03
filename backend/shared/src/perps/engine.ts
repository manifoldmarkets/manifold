// ManiPerp engine — orchestrates open/close, oracle updates, funding, and
// resolution. All entry points open a serializable transaction, acquire a
// per-contract advisory lock, load pool + positions, run the pure math in
// common/src/perps/amm.ts, and write back via pgTrans.multi.
//
// This keeps the rest of place-bet / CPMM untouched.

import { APIError } from 'common/api/utils'
import { PerpContract } from 'common/contract'
import { PERPS_SKIP_ORACLE_FRESHNESS } from 'common/envs/constants'
import {
  applyADL,
  applyFunding,
  closePosition as closePositionMath,
  computeFundingRate,
  getLeverage,
  getPositionValue,
  liquidationPrice as computeLiquidationPrice,
  openPosition as openPositionMath,
  PerpState,
  processLiquidations,
  solvencyFactor,
} from 'common/perps/amm'
import {
  PerpDirection,
  PerpEvent,
  PerpFundingEvent,
  PerpPosition,
} from 'common/perps/position'
import { removeUndefinedProps } from 'common/util/object'
import { runTxnOutsideBetQueue } from 'shared/txn/run-txn'
import {
  SupabaseDirectClient,
  SupabaseTransaction,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import {
  advisoryLockQuery,
  deleteContractPositionsQuery,
  deletePositionsQuery,
  insertFundingEventQuery,
  insertPerpEventsQuery,
  mergeContractDataQuery,
  rowToPosition,
  selectContractForUpdateQuery,
  selectLatestOraclePriceQuery,
  selectPositionsForUpdateQuery,
  upsertPositionsQuery,
} from './queries'
import { buildPerpUserContractMetricsQuery } from './user-contract-metrics'
import { log } from 'shared/utils'
import { getUser } from 'shared/utils'
import { HOUR_MS, MINUTE_MS } from 'common/util/time'

// -----------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------

type LoadedState = {
  contract: PerpContract
  state: PerpState
}

const buildState = (
  contract: PerpContract,
  positions: PerpPosition[]
): PerpState => ({
  pool: { L: contract.poolLong, S: contract.poolShort },
  positions,
})

const loadStateForUpdate = async (
  pgTrans: SupabaseTransaction,
  contractId: string
): Promise<LoadedState> => {
  // `select pg_advisory_xact_lock(...)` returns a row (void column), so
  // .none() would throw "No return data was expected". .one() is correct.
  await pgTrans.one(advisoryLockQuery(contractId))

  const contractRow = await pgTrans.oneOrNone<{ data: PerpContract }>(
    selectContractForUpdateQuery(contractId)
  )
  if (!contractRow)
    throw new APIError(404, `Contract ${contractId} not found`)
  const contract = contractRow.data
  if (contract.mechanism !== 'perp')
    throw new APIError(400, `Contract ${contractId} is not a perp`)
  if (contract.isResolved)
    throw new APIError(400, `Contract ${contractId} is resolved`)

  const positionRows = await pgTrans.any(selectPositionsForUpdateQuery(contractId))
  const positions = positionRows.map((r: any) => rowToPosition(r))

  return { contract, state: buildState(contract, positions) }
}

const getLatestOraclePrice = async (
  pgTrans: SupabaseDirectClient,
  feedId: string
): Promise<{ price: number; ts: number } | null> => {
  const row = await pgTrans.oneOrNone<{ ts: string; price: number | string }>(
    selectLatestOraclePriceQuery(feedId)
  )
  if (!row) return null
  return { price: Number(row.price), ts: new Date(row.ts).getTime() }
}

const asEvent = (
  contract: PerpContract,
  partial: Omit<PerpEvent, 'contractId' | 'ts' | 'oraclePrice'> & {
    ts?: number
    oraclePrice?: number
  }
): PerpEvent => ({
  contractId: contract.id,
  ts: partial.ts ?? Date.now(),
  oraclePrice: partial.oraclePrice ?? contract.oraclePrice,
  ...partial,
})

const diffForWrite = (
  before: PerpPosition[],
  after: PerpPosition[]
): {
  upserts: PerpPosition[]
  deletes: { userId: string; direction: PerpDirection }[]
} => {
  const key = (p: PerpPosition) => `${p.userId}:${p.direction}`
  const beforeByKey = new Map(before.map((p) => [key(p), p]))
  const afterByKey = new Map(after.map((p) => [key(p), p]))
  const upserts: PerpPosition[] = []
  const deletes: { userId: string; direction: PerpDirection }[] = []
  for (const [k, p] of afterByKey) {
    const prev = beforeByKey.get(k)
    if (p.size <= 0) {
      if (prev && prev.size > 0)
        deletes.push({ userId: p.userId, direction: p.direction })
      continue
    }
    if (!prev || prev.size !== p.size || prev.costBasis !== p.costBasis)
      upserts.push(p)
  }
  for (const [k, p] of beforeByKey) {
    if (!afterByKey.has(k) && p.size > 0)
      deletes.push({ userId: p.userId, direction: p.direction })
  }
  return { upserts, deletes }
}

// -----------------------------------------------------------------------
// open / add
// -----------------------------------------------------------------------

export const openOrAddPosition = async (
  contractId: string,
  userId: string,
  direction: PerpDirection,
  mana: number,
  leverage: number
) => {
  if (mana <= 0) throw new APIError(400, 'mana must be positive')
  if (leverage <= 0) throw new APIError(400, 'leverage must be positive')

  const user = await getUser(userId)
  if (!user) throw new APIError(404, `User ${userId} not found`)
  if (user.balance < mana)
    throw new APIError(403, `Insufficient balance: needed ${mana}`)

  return runTransactionWithRetries(async (pgTrans) => {
    const { contract, state } = await loadStateForUpdate(pgTrans, contractId)

    if (leverage > contract.maxLeverage)
      throw new APIError(
        400,
        `Leverage ${leverage} exceeds max ${contract.maxLeverage}`
      )

    // Oracle freshness.
    const now = Date.now()
    if (
      !PERPS_SKIP_ORACLE_FRESHNESS &&
      contract.oraclePriceTime &&
      now - contract.oraclePriceTime > contract.maxOraclePriceAgeMs
    ) {
      throw new APIError(
        400,
        `Oracle feed is stale (age ${
          now - contract.oraclePriceTime
        }ms > ${contract.maxOraclePriceAgeMs}ms)`
      )
    }

    // Flip behavior: if the user has an existing opposite-side position, we
    // auto-close it at the oracle price first, in the same tx. This used to
    // throw a "close your long first" error; the parimutuel AMM doesn't need
    // the one-way restriction, and forcing a separate round-trip is just
    // friction for a flip.
    const existingOpposite = state.positions.find(
      (p) => p.userId === userId && p.direction !== direction && p.size > 0
    )
    const existingSame = state.positions.find(
      (p) => p.userId === userId && p.direction === direction && p.size > 0
    )
    // Check the event log rather than the current positions table: closing a
    // position deletes the row, so a repeat trader would otherwise keep
    // looking "new" on every re-open and repeatedly trigger the
    // UNIQUE_BETTOR_BONUS. `contract_perp_events` is append-only, so any
    // prior open/add/close by this user disqualifies them.
    const priorEvent = await pgTrans.oneOrNone<{ user_id: string }>(
      `select user_id from contract_perp_events
        where contract_id = $1 and user_id = $2
        limit 1`,
      [contractId, userId]
    )
    const isNewUniqueBettor = !priorEvent

    // No notional cap vs. the opposite pool: this AMM is parimutuel, so
    // the opposite pool is meant to be bootstrapped by imbalanced early
    // flow. Solvency is still enforced below (post-trade solvency >= 1)
    // and funding + ADL handle persistent imbalance over time.

    const price = contract.oraclePrice

    // Auto-close opposite side first, then open on top of the resulting state.
    let workingState: PerpState = state
    let closeEvent: PerpEvent | undefined
    let closePayout = 0
    if (existingOpposite) {
      const closeRes = closePositionMath(workingState, existingOpposite, price)
      workingState = closeRes.state
      closePayout = closeRes.payout
      closeEvent = asEvent(contract, {
        userId,
        eventType: 'close',
        direction: existingOpposite.direction,
        leverage: 0,
        sizeDelta: -existingOpposite.size,
        costBasisDelta: -existingOpposite.costBasis,
        originalCostBasisDelta: -existingOpposite.originalCostBasis,
        data: {
          payout: closeRes.payout,
          pnl: closeRes.pnl,
          entryPrice: existingOpposite.entryPrice,
          closePrice: price,
          originalCostBasis: existingOpposite.originalCostBasis,
          reason: 'flip',
        },
        ts: now,
        oraclePrice: price,
      })
    }

    const open = openPositionMath(
      workingState,
      userId,
      contractId,
      direction,
      mana,
      leverage,
      price,
      existingSame,
      now
    )

    // Post-trade solvency must be >= 1.
    const solv = solvencyFactor(direction, open.state, price)
    if (solv < 1)
      throw new APIError(
        400,
        `Post-trade solvency ${solv.toFixed(3)} < 1; try lower leverage or size`
      )

    const { upserts, deletes } = diffForWrite(state.positions, open.state.positions)

    const event: PerpEvent = asEvent(contract, {
      userId,
      eventType: existingSame ? 'add' : 'open',
      direction,
      leverage: open.position.leverage,
      sizeDelta: open.deltaSize,
      costBasisDelta: open.deltaCostBasis,
      originalCostBasisDelta: open.deltaOriginalCostBasis,
      data: {
        entryPrice: open.position.entryPrice,
        liquidationPrice: open.position.liquidationPrice,
        mana,
        leverage,
      },
      ts: now,
      oraclePrice: price,
    })

    // Count any auto-closed opposite notional toward volume so the market
    // chart reflects the full round-trip (flip = close + open on one click).
    const flipVolume = existingOpposite?.size ?? 0
    const contractPatch = removeUndefinedProps({
      poolLong: open.state.pool.L,
      poolShort: open.state.pool.S,
      lastBetTime: now,
      lastUpdatedTime: now,
      volume: (contract.volume ?? 0) + mana * leverage + flipVolume,
      volume24Hours:
        (contract.volume24Hours ?? 0) + mana * leverage + flipVolume,
      // Only bump on a genuine first-time bettor. Previously this checked
      // `existingSame`, so a flip (existingOpposite set, existingSame unset)
      // would double-count the same user and drift the metadata used by
      // ranking/scoring.
      uniqueBettorCount: isNewUniqueBettor
        ? contract.uniqueBettorCount + 1
        : contract.uniqueBettorCount,
    })

    // Credit the close payout (if any) back to the user. Must run before the
    // open-debit so the user's balance reflects the freed margin if they're
    // re-using it to fund the new position.
    if (closePayout > 0) {
      await runTxnOutsideBetQueue(
        pgTrans,
        {
          category: 'CONTRACT_RESOLUTION_PAYOUT',
          fromId: contractId,
          fromType: 'CONTRACT',
          toId: userId,
          toType: 'USER',
          amount: closePayout,
          token: 'M$',
          data: {},
        },
        true
      )
    }

    // Debit user balance via a txn. `ADD_SUBSIDY` is the USER→CONTRACT category
    // that matches what actually happens here (trader margin enters a pool),
    // and keeps perp opens distinguishable from CPMM ante deposits in audit
    // tooling.
    await runTxnOutsideBetQueue(
      pgTrans,
      {
        category: 'ADD_SUBSIDY',
        fromId: userId,
        fromType: 'USER',
        toId: contractId,
        toType: 'CONTRACT',
        amount: mana,
        token: 'M$',
      },
      true
    )

    const newEvents = closeEvent ? [closeEvent, event] : [event]

    const metricsQuery = await buildPerpUserContractMetricsQuery(pgTrans, {
      contract: { ...contract, ...contractPatch } as PerpContract,
      userIds: [userId],
      newEvents,
      finalPositions: open.state.positions,
    })

    // Deletes must run before upserts: on a flip, the new same-side position
    // and the old opposite-side position share (contract_id, user_id), and
    // the partial unique index `contract_perp_positions_one_way` (keyed on
    // those two cols where size > 0) is immediate, so the upsert would fail
    // if the opposite row still existed at the point of insert.
    await pgTrans.multi(
      [
        deletePositionsQuery(contractId, deletes),
        upsertPositionsQuery(upserts),
        insertPerpEventsQuery(newEvents),
        mergeContractDataQuery(contractId, contractPatch),
        metricsQuery,
      ].join(';\n')
    )

    return { position: open.position, event, isNewUniqueBettor }
  })
}

// -----------------------------------------------------------------------
// close
// -----------------------------------------------------------------------

export const closePosition = async (
  contractId: string,
  userId: string,
  direction: PerpDirection
) => {
  return runTransactionWithRetries(async (pgTrans) => {
    const { contract, state } = await loadStateForUpdate(pgTrans, contractId)
    const position = state.positions.find(
      (p) => p.userId === userId && p.direction === direction && p.size > 0
    )
    if (!position) throw new APIError(404, 'No open position to close')

    // Oracle freshness: a stale feed would let a user cherry-pick a favorable
    // cached price after watching the real market move. Mirror the open-side
    // check here so both sides of the trade use the same guardrail.
    const now = Date.now()
    if (
      !PERPS_SKIP_ORACLE_FRESHNESS &&
      contract.oraclePriceTime &&
      now - contract.oraclePriceTime > contract.maxOraclePriceAgeMs
    ) {
      throw new APIError(
        400,
        `Oracle feed is stale (age ${
          now - contract.oraclePriceTime
        }ms > ${contract.maxOraclePriceAgeMs}ms) — try again after the next update`
      )
    }

    const price = contract.oraclePrice
    const result = closePositionMath(state, position, price)

    const event: PerpEvent = asEvent(contract, {
      userId,
      eventType: 'close',
      direction,
      leverage: 0,
      sizeDelta: -position.size,
      costBasisDelta: -position.costBasis,
      originalCostBasisDelta: -position.originalCostBasis,
      data: {
        payout: result.payout,
        pnl: result.pnl,
        entryPrice: position.entryPrice,
        closePrice: price,
        originalCostBasis: position.originalCostBasis,
      },
      ts: now,
      oraclePrice: price,
    })

    const contractPatch = removeUndefinedProps({
      poolLong: result.state.pool.L,
      poolShort: result.state.pool.S,
      lastBetTime: now,
      lastUpdatedTime: now,
    })

    // Credit user balance.
    if (result.payout > 0) {
      await runTxnOutsideBetQueue(
        pgTrans,
        {
          category: 'CONTRACT_RESOLUTION_PAYOUT',
          fromId: contractId,
          fromType: 'CONTRACT',
          toId: userId,
          toType: 'USER',
          amount: result.payout,
          token: 'M$',
          data: {},
        },
        true
      )
    }

    const metricsQuery = await buildPerpUserContractMetricsQuery(pgTrans, {
      contract: { ...contract, ...contractPatch } as PerpContract,
      userIds: [userId],
      newEvents: [event],
      finalPositions: result.state.positions,
    })

    await pgTrans.multi(
      [
        deletePositionsQuery(contractId, [{ userId, direction }]),
        insertPerpEventsQuery([event]),
        mergeContractDataQuery(contractId, contractPatch),
        metricsQuery,
      ].join(';\n')
    )

    return { payout: result.payout, pnl: result.pnl }
  })
}

// -----------------------------------------------------------------------
// oracle update: liquidation + ADL
// -----------------------------------------------------------------------

export type AdlAdjustedPosition = {
  position: PerpPosition
  scaleFactor: number
}

export type OracleUpdateResult = {
  liquidated: PerpPosition[]
  adlAdjusted: AdlAdjustedPosition[]
  adlFactorLong: number
  adlFactorShort: number
  poolLongBefore: number
  poolLongAfter: number
  poolShortBefore: number
  poolShortAfter: number
}

/**
 * Apply one oracle update (liquidation + ADL) to an already-loaded state and
 * return the pieces needed to compose the writes. This is the core of both
 * `runOracleUpdate` (scheduler path) and the pre-settlement pass inside
 * `resolvePerp`, so sharing it means we don't commit twice during resolution.
 */
const applyOracleUpdate = (
  contract: PerpContract,
  state: PerpState,
  newPrice: number,
  ts: number
) => {
  const liqRes = processLiquidations(state, newPrice)
  const adlRes = applyADL(liqRes.state, newPrice)
  const finalState = adlRes.state

  const events: PerpEvent[] = []

  for (const liq of liqRes.liquidated) {
    events.push(
      asEvent(contract, {
        userId: liq.userId,
        eventType: 'liquidation',
        direction: liq.direction,
        leverage: 0,
        sizeDelta: -liq.size,
        costBasisDelta: -liq.costBasis,
        originalCostBasisDelta: -liq.originalCostBasis,
        data: {
          entryPrice: liq.entryPrice,
          liquidationPrice: liq.liquidationPrice,
          originalCostBasis: liq.originalCostBasis,
          payout: 0, // margin forfeited to pool
        },
        ts,
        oraclePrice: newPrice,
      })
    )
  }

  // Identify the exact positions whose size was scaled down by ADL (only
  // profitable positions on the winning side are touched).
  const adlAdjusted: AdlAdjustedPosition[] = []
  const preByKey = new Map(
    state.positions.map((p) => [`${p.userId}:${p.direction}`, p])
  )
  for (const post of finalState.positions) {
    const pre = preByKey.get(`${post.userId}:${post.direction}`)
    if (!pre || pre.size <= 0 || post.size <= 0) continue
    const factor =
      post.direction === 'long' ? adlRes.adlFactorLong : adlRes.adlFactorShort
    if (factor >= 1) continue
    // A liquidation also shrinks the position, but those appear as size 0
    // in finalState and are filtered above; remaining shrinks are ADL only.
    if (post.size < pre.size) {
      adlAdjusted.push({ position: post, scaleFactor: factor })
    }
  }

  if (adlRes.adlFactorLong < 1 || adlRes.adlFactorShort < 1) {
    events.push(
      asEvent(contract, {
        userId: null,
        eventType: 'adl',
        direction: null,
        leverage: null,
        sizeDelta: 0,
        costBasisDelta: 0,
        originalCostBasisDelta: 0,
        data: {
          adlFactorLong: adlRes.adlFactorLong,
          adlFactorShort: adlRes.adlFactorShort,
          affectedUserIds: adlAdjusted.map((a) => a.position.userId),
        },
        ts,
        oraclePrice: newPrice,
      })
    )
  }

  return {
    finalState,
    events,
    liquidated: liqRes.liquidated,
    adlAdjusted,
    adlFactorLong: adlRes.adlFactorLong,
    adlFactorShort: adlRes.adlFactorShort,
  }
}

export const runOracleUpdate = async (
  contractId: string,
  newPrice: number,
  ts: number
): Promise<OracleUpdateResult | null> => {
  return runTransactionWithRetries(async (pgTrans) => {
    const { contract, state } = await loadStateForUpdate(pgTrans, contractId)

    if (newPrice <= 0) throw new APIError(400, 'invalid oracle price')

    const poolLongBefore = state.pool.L
    const poolShortBefore = state.pool.S

    const applied = applyOracleUpdate(contract, state, newPrice, ts)

    const { upserts, deletes } = diffForWrite(
      state.positions,
      applied.finalState.positions
    )

    // Never rewind oraclePriceTime — an out-of-order write would otherwise
    // make the staleness window artificially strict on future trades.
    const nextOraclePriceTime = Math.max(contract.oraclePriceTime ?? 0, ts)

    const contractPatch = removeUndefinedProps({
      poolLong: applied.finalState.pool.L,
      poolShort: applied.finalState.pool.S,
      oraclePrice: newPrice,
      oraclePriceTime: nextOraclePriceTime,
      lastUpdatedTime: ts,
    })

    // Fast path: no liquidations and no ADL means no position changed, so
    // only the contract's cached price needs writing. Without this, a
    // sub-minute oracle tick rebuilds user_contract_metrics for every holder
    // on every price move. Metric rows DO embed unrealized PnL at the oracle
    // price, but runFunding rebuilds them for all holders unconditionally, so
    // they stay at worst FUNDING_PERIOD_MS stale — the pre-fast-tick cadence.
    if (
      upserts.length === 0 &&
      deletes.length === 0 &&
      applied.events.length === 0
    ) {
      // mergeContractDataQuery ends in `returning *`, so exactly one row comes
      // back — .none() would throw QueryResultError(notEmpty) and roll back
      // the whole tick (froze every fast-feed perp at its creation price).
      await pgTrans.one(mergeContractDataQuery(contractId, contractPatch))
      return {
        liquidated: [],
        adlAdjusted: [],
        adlFactorLong: 1,
        adlFactorShort: 1,
        poolLongBefore,
        poolLongAfter: applied.finalState.pool.L,
        poolShortBefore,
        poolShortAfter: applied.finalState.pool.S,
      }
    }

    const affectedUsers = Array.from(
      new Set<string>([
        ...state.positions.map((p) => p.userId),
        ...applied.finalState.positions.map((p) => p.userId),
      ])
    )

    const metricsQuery = await buildPerpUserContractMetricsQuery(pgTrans, {
      contract: { ...contract, ...contractPatch } as PerpContract,
      userIds: affectedUsers,
      newEvents: applied.events,
      finalPositions: applied.finalState.positions,
    })

    await pgTrans.multi(
      [
        upsertPositionsQuery(upserts),
        deletePositionsQuery(contractId, deletes),
        insertPerpEventsQuery(applied.events),
        mergeContractDataQuery(contractId, contractPatch),
        metricsQuery,
      ].join(';\n')
    )

    return {
      liquidated: applied.liquidated,
      adlAdjusted: applied.adlAdjusted,
      adlFactorLong: applied.adlFactorLong,
      adlFactorShort: applied.adlFactorShort,
      poolLongBefore,
      poolLongAfter: applied.finalState.pool.L,
      poolShortBefore,
      poolShortAfter: applied.finalState.pool.S,
    }
  })
}

// -----------------------------------------------------------------------
// funding
// -----------------------------------------------------------------------

export const runFunding = async (
  contractId: string,
  ts: number,
  /**
   * Optional stats from the oracle update that ran immediately before funding.
   * Recorded into the funding-event row so the funding chart can annotate
   * periods with liquidations/ADL.
   */
  priorOracleResult?: OracleUpdateResult | null
): Promise<PerpFundingEvent | null> => {
  return runTransactionWithRetries(async (pgTrans) => {
    const { contract, state } = await loadStateForUpdate(pgTrans, contractId)

    // Cadence gate lives INSIDE the advisory lock: the scheduler's own check
    // runs unlocked, so two overlapping ticks (fine hourly, likely at fast
    // tick rates) could both decide to fund and double-haircut positions.
    // The one-minute tolerance stops scheduler jitter from skipping a period.
    const lastFunding = await pgTrans.oneOrNone<{ ts: string }>(
      `select ts from contract_perp_funding_events
       where contract_id = $1 order by ts desc limit 1`,
      [contractId]
    )
    if (
      lastFunding &&
      ts - new Date(lastFunding.ts).getTime() < FUNDING_PERIOD_MS - MINUTE_MS
    ) {
      return null
    }

    const fundingRate = computeFundingRate(
      state.pool.L,
      state.pool.S,
      contract.fundingSensitivity,
      contract.maxFundingRate
    )

    const poolLongBefore = state.pool.L
    const poolShortBefore = state.pool.S

    const next = applyFunding(state, fundingRate)
    const { upserts, deletes } = diffForWrite(state.positions, next.positions)

    const fundingEvent: PerpFundingEvent = {
      contractId,
      ts,
      oraclePrice: contract.oraclePrice,
      poolLongBefore,
      poolLongAfter: next.pool.L,
      poolShortBefore,
      poolShortAfter: next.pool.S,
      fundingRate,
      numLiquidations: priorOracleResult?.liquidated.length ?? 0,
      adlFactorLong: priorOracleResult?.adlFactorLong ?? 1,
      adlFactorShort: priorOracleResult?.adlFactorShort ?? 1,
    }

    const contractPatch = removeUndefinedProps({
      poolLong: next.pool.L,
      poolShort: next.pool.S,
      lastFundingTime: ts,
      fundingRate,
      lastUpdatedTime: ts,
    })

    const affectedUsers = Array.from(
      new Set(state.positions.map((p) => p.userId))
    )

    // Per-user funding event rows for PnL attribution/audit trail.
    const perUserEvents: PerpEvent[] = next.positions
      .filter((p) => p.size > 0)
      .map((p) => {
        const before = state.positions.find(
          (q) => q.userId === p.userId && q.direction === p.direction
        )
        if (!before) return null
        return asEvent(contract, {
          userId: p.userId,
          eventType: 'funding',
          direction: p.direction,
          leverage: p.leverage,
          sizeDelta: p.size - before.size,
          costBasisDelta: p.costBasis - before.costBasis,
          originalCostBasisDelta: 0,
          data: { fundingRate },
          ts,
          oraclePrice: contract.oraclePrice,
        })
      })
      .filter(Boolean) as PerpEvent[]

    const metricsQuery = await buildPerpUserContractMetricsQuery(pgTrans, {
      contract: { ...contract, ...contractPatch } as PerpContract,
      userIds: affectedUsers,
      newEvents: perUserEvents,
      finalPositions: next.positions,
    })

    await pgTrans.multi(
      [
        upsertPositionsQuery(upserts),
        deletePositionsQuery(contractId, deletes),
        insertPerpEventsQuery(perUserEvents),
        insertFundingEventQuery(fundingEvent),
        mergeContractDataQuery(contractId, contractPatch),
        metricsQuery,
      ].join(';\n')
    )

    return fundingEvent
  })
}

// -----------------------------------------------------------------------
// resolution
// -----------------------------------------------------------------------

export const resolvePerp = async (
  contractId: string,
  resolverId: string
): Promise<{
  closedPositions: { userId: string; direction: PerpDirection; payout: number }[]
  residualPayout: number
  finalPrice: number
}> => {
  // Pull latest oracle price (outside lock to minimize lock window).
  const pg = createSupabaseDirectClient()
  const contractRow = await pg.oneOrNone<{ data: PerpContract }>(
    `select data from contracts where id = $1`,
    [contractId]
  )
  if (!contractRow) throw new APIError(404, `Contract ${contractId} not found`)
  const preContract = contractRow.data
  if (preContract.mechanism !== 'perp')
    throw new APIError(400, 'Not a perp contract')

  const latest = await getLatestOraclePrice(pg, preContract.oracleFeedId)
  const finalPrice = latest?.price ?? preContract.oraclePrice
  const oracleTs = latest?.ts ?? Date.now()
  // Every open position settles at this price; a corrupt feed row here would
  // misprice the whole book. runOracleUpdate has the same guard on ticks.
  if (!isFinite(finalPrice) || finalPrice <= 0)
    throw new APIError(500, `Invalid final oracle price ${finalPrice}`)

  // Single-transaction resolution: apply liquidation + ADL + close-all +
  // residual-to-creator + mark-resolved in one atomic step, so traders can't
  // sneak trades between the "final oracle update" and the settle.
  return runTransactionWithRetries(async (pgTrans) => {
    const { contract, state: loaded } = await loadStateForUpdate(
      pgTrans,
      contractId
    )

    const applied = applyOracleUpdate(contract, loaded, finalPrice, oracleTs)

    const events: PerpEvent[] = [...applied.events]
    const closedPositions: {
      userId: string
      direction: PerpDirection
      payout: number
    }[] = []

    let runningState = applied.finalState
    const now = Date.now()
    for (const p of applied.finalState.positions) {
      if (p.size <= 0) continue
      const res = closePositionMath(runningState, p, finalPrice)
      runningState = res.state
      closedPositions.push({
        userId: p.userId,
        direction: p.direction,
        payout: res.payout,
      })
      events.push(
        asEvent(contract, {
          userId: p.userId,
          eventType: 'close',
          direction: p.direction,
          leverage: 0,
          sizeDelta: -p.size,
          costBasisDelta: -p.costBasis,
          originalCostBasisDelta: -p.originalCostBasis,
          data: {
            payout: res.payout,
            pnl: res.pnl,
            resolvedAt: finalPrice,
            reason: 'resolve-market',
          },
          ts: now,
          oraclePrice: finalPrice,
        })
      )

      if (res.payout > 0) {
        await runTxnOutsideBetQueue(
          pgTrans,
          {
            category: 'CONTRACT_RESOLUTION_PAYOUT',
            fromId: contractId,
            fromType: 'CONTRACT',
            toId: p.userId,
            toType: 'USER',
            amount: res.payout,
            token: 'M$',
            data: {},
          },
          true
        )
      }
    }

    // Residual pool funds go to creator.
    const residualPayout = Math.max(runningState.pool.L + runningState.pool.S, 0)
    if (residualPayout > 0) {
      await runTxnOutsideBetQueue(
        pgTrans,
        {
          category: 'CONTRACT_RESOLUTION_PAYOUT',
          fromId: contractId,
          fromType: 'CONTRACT',
          toId: contract.creatorId,
          toType: 'USER',
          amount: residualPayout,
          token: 'M$',
          data: {},
        },
        true
      )
    }

    const contractPatch = removeUndefinedProps({
      poolLong: 0,
      poolShort: 0,
      oraclePrice: finalPrice,
      oraclePriceTime: Math.max(contract.oraclePriceTime ?? 0, oracleTs),
      isResolved: true,
      resolutionTime: now,
      resolverId,
      resolution: 'MKT',
      resolvedOraclePrice: finalPrice,
      lastUpdatedTime: now,
    })

    const affectedUsers = Array.from(
      new Set([
        ...loaded.positions.map((p) => p.userId),
        ...applied.finalState.positions.map((p) => p.userId),
      ])
    )

    const metricsQuery = await buildPerpUserContractMetricsQuery(pgTrans, {
      contract: { ...contract, ...contractPatch } as PerpContract,
      userIds: affectedUsers,
      newEvents: events,
      // All positions are closed on resolve.
      finalPositions: [],
    })

    await pgTrans.multi(
      [
        deleteContractPositionsQuery(contractId),
        insertPerpEventsQuery(events),
        mergeContractDataQuery(contractId, contractPatch),
        metricsQuery,
      ].join(';\n')
    )

    return { closedPositions, residualPayout, finalPrice }
  })
}

// Convenience exports for scheduler / tests.
export const getLatestOraclePriceForFeed = async (feedId: string) => {
  const pg = createSupabaseDirectClient()
  return getLatestOraclePrice(pg, feedId)
}

export const FUNDING_PERIOD_MS = HOUR_MS

// Re-exports used by callers.
export {
  computeFundingRate,
  computeLiquidationPrice,
  getLeverage,
  getPositionValue,
}

// Silence unused warnings for utility re-exports.
void log
