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
  AdlSettlement,
  applyADL,
  applyFundingWithSolvency,
  assertPerpFundingConfig,
  assertPerpStateSolvent,
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
import {
  decideOracleTransition,
  OraclePoint,
  validateBasicOraclePoint,
} from 'common/perps/oracle'
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
import { getFundingPeriodMs, shouldApplyFunding } from 'common/perps/funding'

// -----------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------

type LoadedState = {
  contract: PerpContract
  state: PerpState
}

// All engine writers on one contract serialize on the advisory lock, but each
// waiter's SERIALIZABLE snapshot predates the winner's commit, so contended
// transactions abort with 40001 on wake-up and must retry. Under a burst
// (concurrent trades + the 15s tick) the default 3 attempts demonstrably
// exhaust: the QA drill lost 2 of 6 parallel ops. 8 attempts with the
// jittered backoff in transactWithRetries absorbs bursts; integrity is
// unaffected either way (failed attempts write nothing).
const PERP_TX_MAX_ATTEMPTS = 8
const runPerpTransaction = <T>(
  fn: (pgTrans: SupabaseTransaction) => Promise<T>
): Promise<T> => runTransactionWithRetries(fn, PERP_TX_MAX_ATTEMPTS)

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
  if (!contractRow) throw new APIError(404, `Contract ${contractId} not found`)
  const contract = contractRow.data
  if (contract.mechanism !== 'perp')
    throw new APIError(400, `Contract ${contractId} is not a perp`)
  if (contract.isResolved)
    throw new APIError(400, `Contract ${contractId} is resolved`)

  const positionRows = await pgTrans.any(
    selectPositionsForUpdateQuery(contractId)
  )
  const positions = positionRows.map((r: any) => rowToPosition(r))

  return { contract, state: buildState(contract, positions) }
}

const getLatestOraclePrice = async (
  pgTrans: Pick<SupabaseDirectClient, 'oneOrNone'>,
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

  return runPerpTransaction(async (pgTrans) => {
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
        `Oracle feed is stale (age ${now - contract.oraclePriceTime}ms > ${
          contract.maxOraclePriceAgeMs
        }ms)`
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
    let closePnl = 0
    if (existingOpposite) {
      const closeRes = closePositionMath(workingState, existingOpposite, price)
      workingState = closeRes.state
      assertPerpStateSolvent(workingState, price)
      closePayout = closeRes.payout
      closePnl = closeRes.pnl
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

    const { upserts, deletes } = diffForWrite(
      state.positions,
      open.state.positions
    )

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

    // Cross-market discovery volume measures mana put at risk, matching the
    // amount-based volume used by ordinary markets. Leveraged notional remains
    // available in the event's sizeDelta, but counting it here would let a
    // tiny 100x trade buy the same ranking weight as 100x the committed mana.
    // A flip is a close plus an open, so count both margin legs.
    const tradeVolume = mana + (existingOpposite?.originalCostBasis ?? 0)
    const contractPatch = removeUndefinedProps({
      poolLong: open.state.pool.L,
      poolShort: open.state.pool.S,
      lastBetTime: now,
      lastUpdatedTime: now,
      volume: (contract.volume ?? 0) + tradeVolume,
      volume24Hours: (contract.volume24Hours ?? 0) + tradeVolume,
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
    if (closePayout > 0 && existingOpposite) {
      await runTxnOutsideBetQueue(
        pgTrans,
        {
          category: 'PERP_CLOSE_PAYOUT',
          fromId: contractId,
          fromType: 'CONTRACT',
          toId: userId,
          toType: 'USER',
          amount: closePayout,
          token: 'M$',
          data: {
            direction: existingOpposite.direction,
            pnl: closePnl,
            entryPrice: existingOpposite.entryPrice,
            closePrice: price,
            reason: 'flip',
          },
        },
        true
      )
    }

    // Debit the margin. Dedicated category so perp margin is distinguishable
    // from real liquidity subsidies in audit/stats tooling.
    await runTxnOutsideBetQueue(
      pgTrans,
      {
        category: 'PERP_OPEN_MARGIN',
        fromId: userId,
        fromType: 'USER',
        toId: contractId,
        toType: 'CONTRACT',
        amount: mana,
        token: 'M$',
        data: {
          direction,
          leverage,
          sizeDelta: open.deltaSize,
          entryPrice: open.position.entryPrice,
        },
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
  return runPerpTransaction(async (pgTrans) => {
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
        `Oracle feed is stale (age ${now - contract.oraclePriceTime}ms > ${
          contract.maxOraclePriceAgeMs
        }ms) — try again after the next update`
      )
    }

    const price = contract.oraclePrice
    const result = closePositionMath(state, position, price)
    assertPerpStateSolvent(result.state, price)

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
      volume: (contract.volume ?? 0) + position.originalCostBasis,
      volume24Hours: (contract.volume24Hours ?? 0) + position.originalCostBasis,
    })

    // Credit user balance.
    if (result.payout > 0) {
      await runTxnOutsideBetQueue(
        pgTrans,
        {
          category: 'PERP_CLOSE_PAYOUT',
          fromId: contractId,
          fromType: 'CONTRACT',
          toId: userId,
          toType: 'USER',
          amount: result.payout,
          token: 'M$',
          data: {
            direction,
            pnl: result.pnl,
            entryPrice: position.entryPrice,
            closePrice: price,
            reason: 'close',
          },
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
  previousPosition: PerpPosition
  position: PerpPosition
  scaleFactor: number
}

export type AdlSettledPosition = AdlSettlement

export type AdlNotificationResult = {
  adlAdjusted: AdlAdjustedPosition[]
  adlSettled: AdlSettledPosition[]
}

export type OracleUpdateResult = {
  liquidated: PerpPosition[]
  adlAdjusted: AdlNotificationResult['adlAdjusted']
  adlSettled: AdlNotificationResult['adlSettled']
  adlFactorLong: number
  adlFactorShort: number
  poolLongBefore: number
  poolLongAfter: number
  poolShortBefore: number
  poolShortAfter: number
}

const collectAdlAdjusted = (
  before: PerpPosition[],
  after: PerpPosition[],
  adlFactorLong: number,
  adlFactorShort: number
) => {
  const adjusted: AdlAdjustedPosition[] = []
  const beforeByKey = new Map(
    before.map((p) => [`${p.userId}:${p.direction}`, p])
  )
  for (const post of after) {
    const pre = beforeByKey.get(`${post.userId}:${post.direction}`)
    if (!pre || pre.size <= 0 || post.size <= 0) continue
    const factor = post.direction === 'long' ? adlFactorLong : adlFactorShort
    if (factor < 1 && post.size < pre.size) {
      adjusted.push({
        previousPosition: pre,
        position: post,
        scaleFactor: factor,
      })
    }
  }
  return adjusted
}

const buildAdlEvents = (
  contract: PerpContract,
  adjusted: AdlAdjustedPosition[],
  settled: AdlSettledPosition[],
  adlFactorLong: number,
  adlFactorShort: number,
  ts: number,
  oraclePrice: number
) => {
  const userEvents: PerpEvent[] = [
    ...adjusted.map(
      ({ previousPosition: before, position: after, scaleFactor }) =>
        asEvent(contract, {
          userId: after.userId,
          eventType: 'adl',
          direction: after.direction,
          leverage: after.leverage,
          sizeDelta: after.size - before.size,
          costBasisDelta: after.costBasis - before.costBasis,
          originalCostBasisDelta: 0,
          data: {
            adlFactor: scaleFactor,
            sizeBefore: before.size,
            sizeAfter: after.size,
          },
          ts,
          oraclePrice,
        })
    ),
    ...settled.map(({ position, payout }) =>
      asEvent(contract, {
        userId: position.userId,
        eventType: 'adl',
        direction: position.direction,
        leverage: 0,
        sizeDelta: -position.size,
        costBasisDelta: -position.costBasis,
        originalCostBasisDelta: -position.originalCostBasis,
        data: {
          adlFactor: 0,
          sizeBefore: position.size,
          sizeAfter: 0,
          payout,
          reason: 'factor-zero-settlement',
        },
        ts,
        oraclePrice,
      })
    ),
  ]

  if (adlFactorLong >= 1 && adlFactorShort >= 1) return userEvents

  return [
    ...userEvents,
    asEvent(contract, {
      userId: null,
      eventType: 'adl',
      direction: null,
      leverage: null,
      sizeDelta: 0,
      costBasisDelta: 0,
      originalCostBasisDelta: 0,
      data: {
        adlFactorLong,
        adlFactorShort,
        affectedUserIds: [
          ...adjusted.map((a) => a.position.userId),
          ...settled.map((s) => s.position.userId),
        ],
        settledUserIds: settled.map((s) => s.position.userId),
      },
      ts,
      oraclePrice,
    }),
  ]
}

const payAdlSettlements = async (
  pgTrans: SupabaseTransaction,
  contractId: string,
  oraclePrice: number,
  settled: AdlSettledPosition[]
) => {
  for (const { position, payout } of settled) {
    if (payout <= 0) continue
    await runTxnOutsideBetQueue(
      pgTrans,
      {
        category: 'PERP_CLOSE_PAYOUT',
        fromId: contractId,
        fromType: 'CONTRACT',
        toId: position.userId,
        toType: 'USER',
        amount: payout,
        token: 'M$',
        data: {
          direction: position.direction,
          pnl: 0,
          entryPrice: position.entryPrice,
          closePrice: oraclePrice,
          reason: 'adl',
        },
      },
      true
    )
  }
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
  assertPerpStateSolvent(finalState, newPrice)

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

  const adlAdjusted = collectAdlAdjusted(
    liqRes.state.positions,
    finalState.positions,
    adlRes.adlFactorLong,
    adlRes.adlFactorShort
  )
  const adlEvents = buildAdlEvents(
    contract,
    adlAdjusted,
    adlRes.settled,
    adlRes.adlFactorLong,
    adlRes.adlFactorShort,
    ts,
    newPrice
  )
  events.push(...adlEvents)

  return {
    finalState,
    events,
    liquidated: liqRes.liquidated,
    adlAdjusted,
    adlSettled: adlRes.settled,
    adlFactorLong: adlRes.adlFactorLong,
    adlFactorShort: adlRes.adlFactorShort,
  }
}

export const runOracleUpdate = async (
  contractId: string,
  newPrice: number,
  ts: number
): Promise<OracleUpdateResult | null> => {
  return runPerpTransaction(async (pgTrans) => {
    const { contract, state } = await loadStateForUpdate(pgTrans, contractId)

    const incomingPoint = { price: newPrice, ts }
    const currentPoint =
      contract.oraclePriceTime == null
        ? null
        : {
            price: contract.oraclePrice,
            ts: contract.oraclePriceTime,
          }
    const decision = decideOracleTransition(currentPoint, incomingPoint)
    if (decision.action === 'reject')
      throw new APIError(400, `Invalid oracle transition: ${decision.reason}`)
    // Delivery can race even though state writes cannot. Once the contract
    // lock is held, an older point or exact retry must not touch price, pools,
    // positions, metrics, or event history.
    if (decision.action === 'ignore') return null

    const poolLongBefore = state.pool.L
    const poolShortBefore = state.pool.S

    const applied = applyOracleUpdate(contract, state, newPrice, ts)

    const { upserts, deletes } = diffForWrite(
      state.positions,
      applied.finalState.positions
    )

    const contractPatch = removeUndefinedProps({
      poolLong: applied.finalState.pool.L,
      poolShort: applied.finalState.pool.S,
      oraclePrice: newPrice,
      oraclePriceTime: ts,
      // Price polling is infrastructure activity, not user activity. Only a
      // liquidation/ADL transition should refresh discovery freshness.
      lastUpdatedTime: applied.events.length > 0 ? ts : undefined,
    })

    // Fast path: no liquidations and no ADL means no position changed, so
    // only the contract's cached price needs writing. Without this, a
    // sub-minute oracle tick rebuilds user_contract_metrics for every holder
    // on every price move. Metric rows DO embed unrealized PnL at the oracle
    // price, but runFunding rebuilds them for all holders unconditionally, so
    // they stay at worst one funding period stale — the pre-fast-tick cadence.
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
        adlSettled: [],
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

    await payAdlSettlements(pgTrans, contractId, newPrice, applied.adlSettled)

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
      adlSettled: applied.adlSettled,
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

export type FundingUpdateResult = AdlNotificationResult & {
  fundingEvent: PerpFundingEvent
}

export const runFunding = async (
  contractId: string,
  ts: number,
  /**
   * Optional stats from the oracle update that ran immediately before funding.
   * Recorded into the funding-event row so the funding chart can annotate
   * periods with liquidations/ADL.
   */
  priorOracleResult?: OracleUpdateResult | null
): Promise<FundingUpdateResult | null> => {
  return runPerpTransaction(async (pgTrans) => {
    const { contract, state } = await loadStateForUpdate(pgTrans, contractId)

    // Cadence gate lives INSIDE the advisory lock: the scheduler's own check
    // runs unlocked, so two overlapping ticks (fine hourly, likely at fast
    // tick rates) could both decide to fund and double-haircut positions.
    // Same predicate as the scheduler prefilter by construction — both call
    // shouldApplyFunding (common/perps/funding): period elapsed minus the
    // jitter slack, plus — for periods longer than hourly — a new oracle
    // price since the last event. For the oracle side this passes the
    // contract's own oraclePriceTime, which runOracleUpdate committed just
    // before this runs — the freshest view available under the lock.
    const lastFunding = await pgTrans.oneOrNone<{ ts: string }>(
      `select ts from contract_perp_funding_events
       where contract_id = $1 order by ts desc limit 1`,
      [contractId]
    )
    if (
      !shouldApplyFunding({
        now: ts,
        lastFundingTime: lastFunding
          ? new Date(lastFunding.ts).getTime()
          : undefined,
        latestOracleTime: contract.oraclePriceTime,
        fundingPeriodMs: getFundingPeriodMs(contract),
      })
    ) {
      return null
    }

    // Persisted legacy contracts did not necessarily pass today's creation
    // schema. Do not clamp an invalid cap: that would silently rewrite the
    // economics users entered under. Abort this atomic funding tick before
    // any pool, position, event, or balance mutation instead.
    assertPerpFundingConfig({
      fundingSensitivity: contract.fundingSensitivity,
      maxFundingRate: contract.maxFundingRate,
    })
    const fundingRate = computeFundingRate(
      state.pool.L,
      state.pool.S,
      contract.fundingSensitivity,
      contract.maxFundingRate
    )

    const poolLongBefore = state.pool.L
    const poolShortBefore = state.pool.S

    // Funding scales the receiving side's existing mark-to-market PnL. Apply
    // ADL again at the unchanged oracle price and fail closed on any invalid
    // or under-solvent result before constructing persistence queries.
    const fundingResult = applyFundingWithSolvency(
      state,
      fundingRate,
      contract.oraclePrice
    )
    const next = fundingResult.state
    const fundedState = fundingResult.fundedState
    const { upserts, deletes } = diffForWrite(state.positions, next.positions)
    const adlAdjusted = collectAdlAdjusted(
      fundedState.positions,
      next.positions,
      fundingResult.adlFactorLong,
      fundingResult.adlFactorShort
    )
    const adlEvents = buildAdlEvents(
      contract,
      adlAdjusted,
      fundingResult.settled,
      fundingResult.adlFactorLong,
      fundingResult.adlFactorShort,
      ts,
      contract.oraclePrice
    )

    // The hourly cycle can apply ADL once for the oracle move and again for
    // funding. Factors compose multiplicatively for the cycle annotation.
    const adlFactorLong =
      (priorOracleResult?.adlFactorLong ?? 1) * fundingResult.adlFactorLong
    const adlFactorShort =
      (priorOracleResult?.adlFactorShort ?? 1) * fundingResult.adlFactorShort

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
      adlFactorLong,
      adlFactorShort,
    }

    const contractPatch = removeUndefinedProps({
      poolLong: next.pool.L,
      poolShort: next.pool.S,
      lastFundingTime: ts,
      fundingRate,
      lastUpdatedTime: adlEvents.length > 0 ? ts : undefined,
    })

    const affectedUsers = Array.from(
      new Set(state.positions.map((p) => p.userId))
    )

    // Keep the funding transition and any immediately-required ADL as
    // separate per-user events. Combining their size deltas would make a
    // receiver's funding bonus look like a single unexplained exposure cut.
    const perUserFundingEvents: PerpEvent[] = fundedState.positions
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
          data: {
            fundingRate,
          },
          ts,
          oraclePrice: contract.oraclePrice,
        })
      })
      .filter(Boolean) as PerpEvent[]
    const perUserEvents = [...perUserFundingEvents, ...adlEvents]

    await payAdlSettlements(
      pgTrans,
      contractId,
      contract.oraclePrice,
      fundingResult.settled
    )

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

    return {
      fundingEvent,
      adlAdjusted,
      adlSettled: fundingResult.settled,
    }
  })
}

// -----------------------------------------------------------------------
// resolution
// -----------------------------------------------------------------------

export const resolvePerp = async (
  contractId: string,
  resolverId: string
): Promise<
  {
    closedPositions: {
      userId: string
      direction: PerpDirection
      payout: number
    }[]
    residualPayout: number
    finalPrice: number
  } & AdlNotificationResult
> => {
  // Single-transaction resolution: apply liquidation + ADL + close-all +
  // residual-to-creator + mark-resolved in one atomic step, so traders can't
  // sneak trades between the final oracle selection and settlement.
  return runPerpTransaction(async (pgTrans) => {
    const { contract, state: loaded } = await loadStateForUpdate(
      pgTrans,
      contractId
    )

    // Select the immutable final feed point only after acquiring the same
    // contract lock used by trades and oracle ticks. Fetching it before the
    // lock can settle an older point after a newer tick has already changed
    // positions and cached price.
    const latest = await getLatestOraclePrice(pgTrans, contract.oracleFeedId)
    if (!latest)
      throw new APIError(
        500,
        `Cannot resolve ${contract.slug}: oracle feed ${contract.oracleFeedId} has no published price`
      )

    const cachedPoint: OraclePoint = {
      price: contract.oraclePrice,
      ts: contract.oraclePriceTime ?? 0,
    }
    const cachedRejection = validateBasicOraclePoint(cachedPoint)
    if (cachedRejection)
      throw new APIError(
        500,
        `Cannot resolve ${contract.slug}: cached oracle point is invalid (${cachedRejection})`
      )

    const decision = decideOracleTransition(cachedPoint, latest)
    if (decision.action === 'reject')
      throw new APIError(
        500,
        `Cannot resolve ${contract.slug}: oracle integrity check failed (${decision.reason})`
      )
    if (decision.action === 'ignore' && decision.reason === 'stale')
      throw new APIError(
        500,
        `Cannot resolve ${contract.slug}: cached oracle timestamp ${cachedPoint.ts} is newer than feed history ${latest.ts}`
      )

    const finalPoint = decision.action === 'apply' ? latest : cachedPoint
    const { price: finalPrice, ts: oracleTs } = finalPoint
    const applied = applyOracleUpdate(contract, loaded, finalPrice, oracleTs)

    const events: PerpEvent[] = [...applied.events]
    const closedPositions: {
      userId: string
      direction: PerpDirection
      payout: number
    }[] = applied.adlSettled.map(({ position, payout }) => ({
      userId: position.userId,
      direction: position.direction,
      payout,
    }))

    let runningState = applied.finalState
    const now = Date.now()
    await payAdlSettlements(pgTrans, contractId, finalPrice, applied.adlSettled)
    for (const p of applied.finalState.positions) {
      if (p.size <= 0) continue
      const res = closePositionMath(runningState, p, finalPrice)
      runningState = res.state
      assertPerpStateSolvent(runningState, finalPrice)
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
            category: 'PERP_CLOSE_PAYOUT',
            fromId: contractId,
            fromType: 'CONTRACT',
            toId: p.userId,
            toType: 'USER',
            amount: res.payout,
            token: 'M$',
            data: {
              direction: p.direction,
              pnl: res.pnl,
              entryPrice: p.entryPrice,
              closePrice: finalPrice,
              reason: 'resolve',
            },
          },
          true
        )
      }
    }

    // Residual pool funds go to creator.
    const residualPayout = Math.max(
      runningState.pool.L + runningState.pool.S,
      0
    )
    if (residualPayout > 0) {
      await runTxnOutsideBetQueue(
        pgTrans,
        {
          category: 'PERP_RESOLVE_RESIDUAL',
          fromId: contractId,
          fromType: 'CONTRACT',
          toId: contract.creatorId,
          toType: 'USER',
          amount: residualPayout,
          token: 'M$',
          data: { finalPrice },
        },
        true
      )
    }

    const contractPatch = removeUndefinedProps({
      poolLong: 0,
      poolShort: 0,
      oraclePrice: finalPrice,
      oraclePriceTime: oracleTs,
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

    return {
      closedPositions,
      residualPayout,
      finalPrice,
      adlAdjusted: applied.adlAdjusted,
      adlSettled: applied.adlSettled,
    }
  })
}

// Convenience exports for scheduler / tests.
export const getLatestOraclePriceForFeed = async (feedId: string) => {
  const pg = createSupabaseDirectClient()
  return getLatestOraclePrice(pg, feedId)
}

// Funding cadence (FUNDING_PERIOD_MS, getFundingPeriodMs, shouldApplyFunding)
// lives in common/perps/funding — one module for the engine, the scheduler
// prefilter, and the web projections, so the gates can't drift apart.

// Re-exports used by callers.
export {
  computeFundingRate,
  computeLiquidationPrice,
  getLeverage,
  getPositionValue,
}

// Silence unused warnings for utility re-exports.
void log
