// ManiPerp engine — orchestrates open/close, oracle updates, funding, and
// resolution. All entry points open a serializable transaction, acquire a
// per-contract advisory lock, load pool + positions, run the pure math in
// common/src/perps/amm.ts, and write back via pgTrans.multi.
//
// This keeps the rest of place-bet / CPMM untouched.

import {
  enqueuePerpOrder,
  findSkippedPerpObservation,
  hasEligiblePendingPerpOrder,
  hasPendingPerpOrders,
  settlePendingPerpOrders,
} from './orders'
import { APIError } from 'common/api/utils'
import { getUserBanMessage, isUserBanned } from 'common/ban-utils'
import { PerpContract } from 'common/contract'
import {
  BANNED_TRADING_USER_IDS,
  PERPS_SKIP_ORACLE_FRESHNESS,
} from 'common/envs/constants'
import {
  AdlSettlement,
  applyADL,
  applyFundingWithSolvency,
  assertPerpFundingConfig,
  assertPerpPositionNumbers,
  assertPerpStateNumbers,
  assertPerpStateSolvent,
  closePosition as closePositionMath,
  computeFundingRate,
  getLeverage,
  getPerpBackingPool,
  getPerpOpenInterest,
  getPerpOpenInterestCapacity,
  getPositionValue,
  isPerpSideSolvent,
  liquidationPrice as computeLiquidationPrice,
  MIN_PERP_LEVERAGE,
  openPosition as openPositionMath,
  PERP_MIN_CLOSE_FRACTION,
  PERP_OPEN_INTEREST_COVER_MULTIPLE,
  perpSizeMatchesExpectation,
  PerpState,
  processLiquidations,
  resolvePerpCloseFraction,
  solvencyFactor,
} from 'common/perps/amm'
import {
  PerpDirection,
  PerpEvent,
  PerpFundingEvent,
  PerpPosition,
} from 'common/perps/position'
import {
  accruePerpPositionTakerFee,
  assertPerpTakerFeeConfig,
  calculatePerpOpenCashFlow,
  creditPerpPoolFee,
  formatPerpFeeCents,
  getPerpEffectiveTakerFeeBps,
  getPerpTakerFeeImpact,
  perpOpenFeeQuote,
  perpOwnContributionInputs,
  PERP_MAX_FEE_SHARE_OF_MARGIN,
} from 'common/perps/fees'
import { noFees } from 'common/fees'
import { getUserFacingPnlFromPayout } from 'common/perps/pnl'
import {
  OracleFeedHealth,
  shouldRefreshOracleHealth,
} from 'common/perps/oracle-health'
import {
  decideOracleTransition,
  getPerpOracleFreshness,
  OraclePoint,
  validateBasicOraclePoint,
} from 'common/perps/oracle'
import {
  PROVIDER_SOURCE_CLOCK_ALLOWANCE_MS,
  PROVIDER_STAMPED_FEED_IDS,
} from 'common/perps/orders'
import { removeUndefinedProps } from 'common/util/object'
import { randomStringRegex } from 'common/util/random'
import { UserBan } from 'common/user'
import { notifyPerpOracleResult } from 'shared/notifications/perps'
import { runTxnOutsideBetQueue } from 'shared/txn/run-txn'
import {
  SupabaseDirectClient,
  SupabaseTransaction,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import {
  runTransactionWithRetries,
  TransactionRetryOptions,
} from 'shared/transact-with-retries'
import {
  FAST_TICK_TX_TAG,
  isOracleTickTimeout,
  OracleUpdateBounds,
  oracleTickTimeoutsQuery,
} from 'shared/perps/oracle-tick-bounds'
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
import { assertPerpEscrowBalance } from './escrow'
import { buildPerpUserContractMetricsQuery } from './user-contract-metrics'
import { log } from 'shared/utils'
import { getFundingPeriodMs, shouldApplyFunding } from 'common/perps/funding'

// -----------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------

type LoadedState = {
  contract: PerpContract
  state: PerpState
}

const assertFreshOracleForTrading = (contract: PerpContract, now: number) => {
  if (PERPS_SKIP_ORACLE_FRESHNESS) return
  const freshness = getPerpOracleFreshness(contract, now)
  if (freshness.status === 'fresh') return

  const detail =
    freshness.reason ??
    (freshness.status === 'stale' && freshness.ageMs != null
      ? `Oracle feed is stale (age ${freshness.ageMs}ms > ${contract.maxOraclePriceAgeMs}ms)`
      : 'Oracle feed freshness is unavailable')
  throw new APIError(
    400,
    `${detail} — trading is paused until the next valid update`
  )
}

/**
 * Explicit trading halt set by a tick that could not represent its own result.
 *
 * Normally a book that cannot take a price update is protected implicitly: the
 * mark stops advancing and `assertFreshOracleForTrading` closes the market at
 * `maxOraclePriceAgeMs`. That protection is an accident of the failure, not a
 * decision, and it is a bad one — it leaves the market OPEN at a dead price for
 * a whole freshness budget (5 hours of it on 2026-08-29, during which a trader
 * added to a position at a mark that had been frozen for four).
 *
 * `runOracleUpdate` now always commits the price, so that implicit protection
 * is gone by construction and this takes its place. Closes are gated too: the
 * book is known-inconsistent, and letting one side exit against it at a price
 * the engine could not validate is exactly the drain the halt exists to stop.
 * Scheduler-driven exits (liquidation, ADL, resolution) call the internal paths
 * and are unaffected, so positions still settle.
 */
const assertPerpNotSolvencyHalted = (contract: PerpContract) => {
  if (contract.solvencyHaltTime == null) return
  throw new APIError(
    503,
    `Trading is paused on this market: a risk update could not be applied, and an operator has been alerted. Open positions are unaffected and still settle.`
  )
}

// All engine writers on one contract serialize on the advisory lock, but each
// waiter's SERIALIZABLE snapshot predates the winner's commit, so contended
// transactions abort with 40001 on wake-up and must retry. Under a burst
// (concurrent trades + the 5s tick) the default 3 attempts demonstrably
// exhaust: the QA drill lost 2 of 6 parallel ops. 8 attempts with the
// jittered backoff in transactWithRetries absorbs bursts; integrity is
// unaffected either way (failed attempts write nothing).
const PERP_TX_MAX_ATTEMPTS = 8
const runPerpTransaction = <T>(
  fn: (pgTrans: SupabaseTransaction) => Promise<T>,
  maxAttempts = PERP_TX_MAX_ATTEMPTS,
  options?: TransactionRetryOptions
): Promise<T> => runTransactionWithRetries(fn, maxAttempts, options)

const buildState = (
  contract: PerpContract,
  positions: PerpPosition[]
): PerpState => ({
  pool: { L: contract.poolLong, S: contract.poolShort },
  positions,
})

const loadStateForUpdate = async (
  pgTrans: SupabaseTransaction,
  contractId: string,
  allowResolved = false
): Promise<LoadedState> => {
  // `select pg_advisory_xact_lock(...)` returns a row (void column), so
  // .none() would throw "No return data was expected". .one() is correct.
  await pgTrans.one(advisoryLockQuery(contractId))

  const contractRow = await pgTrans.oneOrNone<{
    data: PerpContract
    token: string | null
  }>(selectContractForUpdateQuery(contractId))
  if (!contractRow) throw new APIError(404, `Contract ${contractId} not found`)
  // `token` is a native contract column and is absent from `data` on newly
  // created markets. Merge it from the same locked read before system-status
  // and ledger checks. Never default it: corrupt rows must fail closed.
  // PERP escrow and margin transactions are M$-denominated. Accepting a CASH
  // row here would pass the CASH system-status gate while still mutating the
  // MANA ledger, so only the product's supported native token is valid.
  if (contractRow.token !== 'MANA')
    throw new APIError(
      500,
      `Contract ${contractId} has invalid PERP token ${
        contractRow.token ?? 'null'
      }; expected MANA`
    )
  const contract: PerpContract = {
    ...contractRow.data,
    token: contractRow.token,
  }
  if (contract.mechanism !== 'perp')
    throw new APIError(400, `Contract ${contractId} is not a perp`)
  if (contract.isResolved && !allowResolved)
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
): Promise<OraclePoint | null> => {
  const row = await pgTrans.oneOrNone<{
    ts: string
    price: number | string
    source_ts: string | null
  }>(selectLatestOraclePriceQuery(feedId))
  if (!row) return null
  const sourceTs =
    row.source_ts == null ? undefined : new Date(row.source_ts).getTime()
  return {
    price: Number(row.price),
    ts: new Date(row.ts).getTime(),
    ...(sourceTs == null ? {} : { sourceTs }),
  }
}

const asEvent = (
  contract: PerpContract,
  partial: Omit<
    PerpEvent,
    'contractId' | 'appliedTime' | 'ts' | 'oraclePrice'
  > & {
    appliedTime?: number
    ts?: number
    oraclePrice?: number
  }
): PerpEvent => {
  const now = Date.now()
  const { appliedTime, ts, oraclePrice, ...event } = partial
  return {
    contractId: contract.id,
    ...event,
    appliedTime: appliedTime ?? now,
    ts: ts ?? now,
    oraclePrice: oraclePrice ?? contract.oraclePrice,
  }
}

type StoredPerpEventRow = {
  id: number | string
  contract_id: string
  user_id: string | null
  event_type: string
  applied_ts: string
  ts: string
  oracle_price: number | string | null
  size_delta: number | string
  cost_basis_delta: number | string
  original_cost_basis_delta: number | string
  direction: string | null
  leverage: number | string | null
  data: unknown
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const finiteNumber = (value: unknown, name: string): number => {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && value.trim() === '')
  ) {
    throw new APIError(500, `Invalid ${name} in PERP idempotency record`)
  }
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number))
    throw new APIError(500, `Invalid ${name} in PERP idempotency record`)
  return number
}

const parseStoredPosition = (value: unknown): PerpPosition => {
  const position = asRecord(value)
  if (!position)
    throw new APIError(500, 'Invalid position in PERP idempotency record')
  if (
    typeof position.userId !== 'string' ||
    typeof position.contractId !== 'string' ||
    (position.direction !== 'long' && position.direction !== 'short')
  ) {
    throw new APIError(500, 'Invalid position in PERP idempotency record')
  }
  const takerFeeCostBasis =
    position.takerFeeCostBasis === undefined
      ? 0
      : finiteNumber(
          position.takerFeeCostBasis,
          'position taker fee cost basis'
        )
  if (takerFeeCostBasis < 0)
    throw new APIError(
      500,
      'Invalid position taker fee cost basis in PERP idempotency record'
    )
  return {
    userId: position.userId,
    contractId: position.contractId,
    direction: position.direction,
    size: finiteNumber(position.size, 'position size'),
    costBasis: finiteNumber(position.costBasis, 'position cost basis'),
    originalCostBasis: finiteNumber(
      position.originalCostBasis,
      'position original cost basis'
    ),
    takerFeeCostBasis,
    entryPrice: finiteNumber(position.entryPrice, 'position entry price'),
    leverage: finiteNumber(position.leverage, 'position leverage'),
    liquidationPrice: finiteNumber(
      position.liquidationPrice,
      'position liquidation price'
    ),
    openedTime: finiteNumber(position.openedTime, 'position opened time'),
    updatedTime: finiteNumber(position.updatedTime, 'position updated time'),
  }
}

const rowToStoredEvent = (row: StoredPerpEventRow): PerpEvent => {
  if (
    row.event_type !== 'open' &&
    row.event_type !== 'add' &&
    row.event_type !== 'close'
  ) {
    throw new APIError(500, 'Invalid event type in PERP idempotency record')
  }
  const direction =
    row.direction === 'long' || row.direction === 'short' ? row.direction : null
  const ts = new Date(row.ts).getTime()
  const appliedTime = new Date(row.applied_ts).getTime()
  if (!Number.isFinite(ts) || !Number.isFinite(appliedTime))
    throw new APIError(500, 'Invalid timestamp in PERP idempotency record')
  return {
    id: finiteNumber(row.id, 'event id'),
    contractId: row.contract_id,
    userId: row.user_id,
    eventType: row.event_type,
    appliedTime,
    ts,
    oraclePrice: finiteNumber(row.oracle_price, 'event oracle price'),
    sizeDelta: finiteNumber(row.size_delta, 'event size delta'),
    costBasisDelta: finiteNumber(
      row.cost_basis_delta,
      'event cost basis delta'
    ),
    originalCostBasisDelta: finiteNumber(
      row.original_cost_basis_delta,
      'event original cost basis delta'
    ),
    direction,
    leverage:
      row.leverage === null
        ? null
        : finiteNumber(row.leverage, 'event leverage'),
    data: asRecord(row.data) ?? undefined,
  }
}

const getIdempotentEvent = async (
  pgTrans: SupabaseTransaction,
  contractId: string,
  userId: string,
  idempotencyKey: string,
  eventTypes: ('open' | 'add' | 'close')[]
) =>
  pgTrans.oneOrNone<StoredPerpEventRow>(
    `select id, contract_id, user_id, event_type, applied_ts, ts, oracle_price,
            size_delta, cost_basis_delta, original_cost_basis_delta,
            direction, leverage, data
     from contract_perp_events
     where contract_id = $1
       and user_id = $2
       and data ? 'idempotencyKey'
       and data->>'idempotencyKey' = $3
       and event_type = any($4)
     limit 1`,
    [contractId, userId, idempotencyKey, eventTypes]
  )

const assertIdempotencyKey = (idempotencyKey: string | undefined) => {
  if (
    idempotencyKey !== undefined &&
    (idempotencyKey.length !== 10 || !randomStringRegex.test(idempotencyKey))
  ) {
    throw new APIError(400, 'Invalid PERP idempotency key')
  }
}

/**
 * Contract-patch fragment carrying the post-transition open interest.
 *
 * Always derived from the transition's FINAL positions rather than adjusted
 * incrementally, so the denormalized copy cannot drift from the positions
 * table however the sizes moved (a trade, a funding haircut, an ADL scale,
 * a liquidation). Every patch that writes poolLong/poolShort spreads this.
 */
const openInterestPatch = (positions: PerpPosition[]) => {
  const { long, short } = getPerpOpenInterest(positions)
  return { openInterestLong: long, openInterestShort: short }
}

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
    if (
      !prev ||
      prev.size !== p.size ||
      prev.costBasis !== p.costBasis ||
      (prev.takerFeeCostBasis ?? 0) !== (p.takerFeeCostBasis ?? 0)
    )
      upserts.push(p)
  }
  for (const [k, p] of beforeByKey) {
    if (!afterByKey.has(k) && p.size > 0)
      deletes.push({ userId: p.userId, direction: p.direction })
  }
  return { upserts, deletes }
}

/**
 * Fail closed on a corrupt row belonging to this user BEFORE any code path
 * reads, closes, or replaces it.
 *
 * Scans EVERY row the user holds on this contract, deliberately ignoring the
 * `size > 0` predicate the callers select with. A row whose size is NaN,
 * negative, or zero-with-margin does not match that predicate, so it would
 * slip past a guard applied to the selected rows alone — and then
 * `openPosition` replaces same-(user, direction) rows WITHOUT re-checking
 * size, so the malformed row would be silently overwritten and its margin
 * lost from the position table while the pool still held it.
 *
 * Corruption also has to be caught before the position is CLOSED, not after.
 * Both the close math and the fee quote read entryPrice through
 * getUnrealizedEquity, which silently returns 0 when entryPrice <= 0: a
 * corrupt row therefore marks as FLAT and pays out its entire cost basis
 * wherever the oracle actually is. The post-close assertPerpStateSolvent
 * cannot save us either, because closePosition has already removed the row
 * from the state it inspects.
 *
 * Rules are shared with assertPerpStateNumbers via assertPerpPositionNumbers
 * so the two can never drift apart.
 */
const assertUserPerpRowsSound = (state: PerpState, userId: string) => {
  for (const row of state.positions) {
    if (row.userId !== userId) continue
    try {
      assertPerpPositionNumbers(row, `your stored ${row.direction} position`)
    } catch (error) {
      throw new APIError(
        500,
        `${
          error instanceof Error ? error.message : String(error)
        } — refusing to trade against a corrupt position row`
      )
    }
  }
}

// -----------------------------------------------------------------------
// open / add
// -----------------------------------------------------------------------

const executePerpTrade = async (
  contractId: string,
  userId: string,
  direction: PerpDirection,
  mana: number,
  leverage: number,
  idempotencyKey: string | undefined,
  /** Trade arrived via an API key rather than the site — recorded on the
   * event so readers can filter bot flow out of the Trades tab, matching
   * `bets.is_api`. Lives in `data` so no migration is needed; events written
   * before this shipped carry no flag and read as manual. */
  isApi: boolean,
  /** Price protection: reject (400) rather than charge when the fee computed
   * inside the locked transaction exceeds this. The fee is state-dependent
   * (pools move, config is live-tunable), so the previewed fee is not a
   * promise — this bound is how a caller makes their consent explicit. Not
   * part of the idempotency fingerprint: a replay returns the stored result
   * of a trade that already happened. */
  maxFee: number | undefined,
  executionTx: SupabaseTransaction,
  /** A queued order's reserve. Affordability counts no cash beyond it, so a
   * balance change after the execution price is public cannot decide whether
   * the order fills. */
  fundingCap?: number
) => {
  assertIdempotencyKey(idempotencyKey)
  if (!Number.isFinite(mana) || mana <= 0)
    throw new APIError(400, 'mana must be a finite positive number')
  if (!Number.isFinite(leverage) || leverage < MIN_PERP_LEVERAGE)
    throw new APIError(
      400,
      `leverage must be a finite number of at least ${MIN_PERP_LEVERAGE}`
    )
  if (maxFee !== undefined && (!Number.isFinite(maxFee) || maxFee < 0))
    throw new APIError(400, 'maxFee must be a finite non-negative number')

  return (async (pgTrans: SupabaseTransaction) => {
    if (idempotencyKey) {
      const stored = await getIdempotentEvent(
        pgTrans,
        contractId,
        userId,
        idempotencyKey,
        ['open', 'add']
      )
      if (stored) {
        const data = asRecord(stored.data)
        const request = asRecord(data?.request)
        const response = asRecord(data?.response)
        if (
          request?.direction !== direction ||
          finiteNumber(request.mana, 'request margin') !== mana ||
          finiteNumber(request.leverage, 'request leverage') !== leverage
        ) {
          throw new APIError(
            409,
            'This PERP idempotency key was already used for a different trade'
          )
        }
        return {
          position: parseStoredPosition(response?.position),
          event: rowToStoredEvent(stored),
          // Events stored before the taker fee existed have no fee field;
          // ones stored before the size fee lack the rate/share stamps.
          fee:
            typeof response?.fee === 'number' && Number.isFinite(response.fee)
              ? response.fee
              : 0,
          feeBps:
            typeof response?.feeBps === 'number' &&
            Number.isFinite(response.feeBps)
              ? response.feeBps
              : undefined,
          poolShareAfter:
            typeof response?.poolShareAfter === 'number' &&
            Number.isFinite(response.poolShareAfter)
              ? response.poolShareAfter
              : undefined,
          isNewUniqueBettor: false,
          // Callers must not re-run trade side effects (bonuses, streaks)
          // for a replay — no trade happened on this request.
          replayed: true,
        }
      }
    }

    const { contract, state } = await loadStateForUpdate(pgTrans, contractId)
    const now = Date.now()

    // Match the authorization and market-state gates used by ordinary bets.
    // These checks live inside the authoritative engine transaction so a
    // script or future caller cannot bypass the HTTP endpoint's ban wrapper,
    // and so a concurrent halt/close is observed before any margin moves.
    const systemStatus = await pgTrans.oneOrNone<{ status: boolean }>(
      `select status from system_trading_status where token = $1`,
      [contract.token]
    )
    if (!systemStatus?.status) {
      throw new APIError(
        403,
        `Trading with ${contract.token} is currently disabled.`
      )
    }

    if (contract.closeTime && now > contract.closeTime)
      throw new APIError(403, 'Trading is closed.')

    const trader = await pgTrans.oneOrNone<{
      id: string
      balance: number
      data: { userDeleted?: boolean } | null
    }>(
      `select id, balance, data
       from users
       where id = $1
       for update`,
      [userId]
    )
    if (!trader) throw new APIError(404, `User ${userId} not found`)
    if (
      trader.data?.userDeleted ||
      BANNED_TRADING_USER_IDS.includes(trader.id)
    ) {
      throw new APIError(403, 'You are banned or deleted.')
    }

    const userBans = await pgTrans.manyOrNone<UserBan>(
      `select *
       from user_bans
       where user_id = $1
         and ended_at is null
         and (end_time is null or end_time > now())`,
      [userId]
    )
    if (isUserBanned(userBans, 'trading')) {
      const message = getUserBanMessage(userBans, 'trading')
      throw new APIError(
        403,
        message
          ? `You are banned from trading. Reason: ${message}`
          : 'You are banned from trading'
      )
    }

    if (contract.creatorBannedFromBetting && userId === contract.creatorId) {
      throw new APIError(
        403,
        'You have blocked yourself from betting on this market. Contact a moderator if you need this reversed.'
      )
    }
    if (!Number.isFinite(trader.balance))
      throw new APIError(500, 'Trader balance is not a finite number')

    if (leverage > contract.maxLeverage)
      throw new APIError(
        400,
        `Leverage ${leverage} exceeds max ${contract.maxLeverage}`
      )

    assertFreshOracleForTrading(contract, now)
    assertPerpNotSolvencyHalted(contract)

    await assertPerpEscrowBalance(pgTrans, contractId, state.pool)

    // Flip behavior: if the user has an existing opposite-side position, we
    // auto-close it at the oracle price first, in the same tx. This used to
    // throw a "close your long first" error; the parimutuel AMM doesn't need
    // the one-way restriction, and forcing a separate round-trip is just
    // friction for a flip.
    // Before the `size > 0` selection below, not after: a malformed size does
    // not match that predicate but openPositionMath would still replace the
    // row. See assertUserPerpRowsSound.
    assertUserPerpRowsSound(state, userId)

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

    const price = contract.oraclePrice

    // Taker fee: size-dependent bps of NOTIONAL when opening or adding,
    // credited to the trader's side backing pool (subsidy, not platform
    // revenue). Closing is free — the whole round-trip cost is visible up
    // front, and the position starts at PnL = −fee via takerFeeCostBasis.
    // Execution happens at the cached oracle price, and with zero fees that
    // price was a free option for tick-sniping bots (2026-08-07: ~M$70k
    // drained from the BTC perp pools at a measured edge of ~1.5 bps of
    // notional per round trip; every snipe needs an entry, so an open-only
    // fee taxes each round trip once). The flat base could not tell honest
    // flow (median ~1% of pool) from pool-sized informed entries (median
    // ~142% of pool, 2026-08-19), so the marginal rate scales with the
    // position's share of the backing pool: base + takerFeeImpact·share²,
    // charged as its integral over the added notional (calcPerpSizeFee) so
    // chopping one big add into many small ones costs the same. The fee mana
    // enters escrow with the margin, so ledger = L + S holds.
    //
    // Two independent dials feed this, and they compose: the CHANNEL picks
    // which base rate applies (API-key opens pay max(takerFeeBps,
    // takerFeeApiBps) when the API rate is set — the 2026-08-19/20 BTC drain
    // was 100% API-key flow, see getPerpEffectiveTakerFeeBps), and the SIZE
    // term then scales on top of whichever base was selected. The event's
    // feeBps stamp records the effective rate actually charged and its isApi
    // flag says which channel selected the base.
    assertPerpTakerFeeConfig(contract, isApi)
    const takerFeeBps = getPerpEffectiveTakerFeeBps(contract, isApi)
    const takerFeeImpact = getPerpTakerFeeImpact(contract)

    // On a market with a size-dependent fee, consent is MANDATORY: the fee
    // varies with live pool state, so a caller who never states a bound can
    // be charged up to their whole margin by state they never saw (a cached
    // client, a bot coded against the flat fee). Mirrors the close path's
    // required expectedOpenedTime. Flat-fee markets stay compatible with
    // older callers — the fee there is knowable from config alone.
    if (takerFeeImpact > 0 && maxFee === undefined)
      throw new APIError(
        400,
        'This market charges a size-dependent fee: pass maxFee (in mana) — the most you accept paying — computed from takerFeeBps, takerFeeImpact, and the pools on the market object.'
      )

    // Auto-close opposite side first, then open on top of the resulting state.
    let workingState: PerpState = state
    let closeEvent: PerpEvent | undefined
    let closePayout = 0
    let closePnl = 0
    let closePricePnl = 0
    if (existingOpposite) {
      const closeRes = closePositionMath(workingState, existingOpposite, price)
      workingState = closeRes.state
      assertPerpStateSolvent(workingState, price)
      closePayout = closeRes.payout
      closePnl = getUserFacingPnlFromPayout(
        closePayout,
        existingOpposite.originalCostBasis,
        existingOpposite.takerFeeCostBasis
      )
      closePricePnl = closeRes.pnl
      closeEvent = asEvent(contract, {
        userId,
        eventType: 'close',
        direction: existingOpposite.direction,
        leverage: 0,
        sizeDelta: -existingOpposite.size,
        costBasisDelta: -existingOpposite.costBasis,
        originalCostBasisDelta: -existingOpposite.originalCostBasis,
        data: {
          payout: closePayout,
          pnl: closePnl,
          pricePnl: closeRes.pnl,
          entryPrice: existingOpposite.entryPrice,
          closePrice: price,
          originalCostBasis: existingOpposite.originalCostBasis,
          takerFeeCostBasis: existingOpposite.takerFeeCostBasis ?? 0,
          reason: 'flip',
        },
        appliedTime: now,
        ts: now,
        oraclePrice: price,
      })
    }

    // Affordability is checked HERE, not before the flip close, because a
    // flip's own close payout funds the new margin: the credit is applied
    // ahead of the debit further down for exactly that reason. Checking
    // against the raw balance up front made that ordering unreachable and
    // rejected the one-call flip for the users it was designed for (a
    // trader whose mana is all in the position they are flipping out of).
    // The user row is locked FOR UPDATE above, so the balance cannot move
    // between here and the debit.
    // Fee inputs: N0 is the user's standing same-direction notional (a flip
    // close removes only the OPPOSITE row, so existingSame is unaffected by
    // it), and the depth is the PRE-trade pool — post flip-close for a flip,
    // since that is the depth the new leg actually consumes against, but
    // before this trade's own margin/fee credits. perpOpenFeeQuote then nets
    // out the trader's own standing contribution, so sequential adds cannot
    // self-deepen the depth they are priced against (see its doc).
    //
    // (Row sanity for both held positions was asserted above, before the flip
    // close — including the entryPrice this mark-to-market read depends on.)
    // The trader's own standing contribution is netted out of the depth at
    // the SAME mark this trade executes against, read inside the advisory
    // lock (`price` is contract.oraclePrice from loadStateForUpdate). Netting
    // the raw costBasis instead deducts margin that has already been paid out
    // to closing counterparties, which collapses the denominator for an
    // underwater holder and — the fee being quadratic in 1/depth — squares
    // the error. Computed here rather than inside perpOpenFeeQuote so the
    // authoritative mark can never be a client-supplied or stale one.
    // Shared with the bet panel's preview so the two cannot derive these
    // differently. A flip has no standing SAME-side row, so every field is 0
    // and the opposite leg's payout — already out of workingState.pool — is
    // never subtracted twice.
    const ownContribution = perpOwnContributionInputs(existingSame, price)
    // getPositionValue floors at 0, so the only reachable failure is a
    // non-finite mark; the message says exactly that rather than implying a
    // negative value is possible.
    if (!Number.isFinite(ownContribution.existingPositionValue))
      throw new APIError(
        500,
        'Existing position value is not a finite number; refusing to price the taker fee'
      )
    const openFeeDetails = perpOpenFeeQuote({
      grossPoolDepth: getPerpBackingPool(
        workingState.pool.L,
        workingState.pool.S
      ),
      ...ownContribution,
      addedNotional: mana * leverage,
      baseBps: takerFeeBps,
      impact: takerFeeImpact,
    })
    const openFee = openFeeDetails.fee
    // Fail closed when the size fee cannot be priced: the trader's own
    // standing claim (margin still in the pool, marked to market, plus fees
    // paid) exhausts the valid gross pool — the margin-cover incident
    // pattern — so the quote fell back to base-only. Charging base there
    // would hand the largest holder in a devastated market the CHEAPEST
    // rate, bypassing the size protection entirely.
    if (openFeeDetails.depthExhausted)
      throw new APIError(
        400,
        'This market’s backing is exhausted relative to your position — the size fee cannot be priced. Close or reduce instead of adding.'
      )
    // Price protection: the fee is state-dependent (pools move, config is
    // live-tunable), so a caller may bound what they consent to pay; the
    // check runs on the authoritative fee inside the locked transaction.
    if (maxFee !== undefined && openFee > maxFee) {
      // The fee in bps of size is what makes "the fee moved" legible next to
      // the fee they were quoted; the amounts are whole cents, the fee rounded
      // up and the allowance down, so a sub-cent overage cannot print as two
      // equal amounts "0.0 bps" apart. Measured drift on BTC: pool outflow
      // puts ~0.15% of the week inside a window that can move a large trade's
      // fee, and only 0.023% of 5s ticks move the mark more than 30 bps — so
      // this should be a rare "click again", not a routine wall.
      throw new APIError(
        400,
        `The fee moved while you were deciding: this trade now costs M$${formatPerpFeeCents(
          openFee,
          'up'
        )} (${openFeeDetails.effectiveBps.toFixed(
          1
        )} bps of size), more than the M$${formatPerpFeeCents(
          maxFee,
          'down'
        )} you approved. Retry to accept the current fee.`
      )
    }
    // Hard consent floor: an opening fee that eats a large share of the
    // trade's own margin is always a mistake or an attack, never intent, so
    // reject rather than charge. Two ways in: extreme leverage × extreme pool
    // share, and a fat-fingered CHANNEL rate — the fee is charged on NOTIONAL,
    // so fee/margin = effectiveBps × leverage / 10_000 and the rate domains
    // are validated independently of maxLeverage. This floor is what keeps
    // both survivable. See PERP_MAX_FEE_SHARE_OF_MARGIN for why the bound is
    // half the margin rather than all of it.
    const feeCeiling = mana * PERP_MAX_FEE_SHARE_OF_MARGIN
    if (openFee >= feeCeiling)
      throw new APIError(
        400,
        `This trade's fee (M$${openFee.toFixed(
          2
        )}) would immediately consume ${((openFee / mana) * 100).toFixed(
          0
        )}% of its M$${mana.toFixed(
          2
        )} margin. Reduce your position size or leverage.`
      )
    // Shared with the bet panel's preview (calculatePerpOpenCashFlow), so the
    // client's affordability check is exactly this one: margin plus the fee
    // as priced above, funded by balance plus a flip's free close payout.
    const cashFlow = calculatePerpOpenCashFlow({
      // The reserve sits a float step under the exact balance; the tolerance
      // covers that and nothing a trader could use.
      balance:
        fundingCap === undefined
          ? trader.balance
          : Math.min(trader.balance, fundingCap * (1 + 1e-12) + 1e-9),
      margin: mana,
      openFee,
      closePayout,
    })
    if (!cashFlow)
      throw new APIError(
        500,
        'Perp trade cash flow is invalid; refusing to debit the trader'
      )
    const { totalDebit, spendableBalance } = cashFlow
    if (!cashFlow.isAffordable)
      throw new APIError(
        403,
        `Insufficient balance: needed ${totalDebit.toFixed(2)} (${mana} margin${
          openFee > 0 ? ` + ${openFee.toFixed(2)} fee` : ''
        }), have ${spendableBalance.toFixed(2)}${
          closePayout > 0 ? ' (including the flipped position)' : ''
        }`
      )

    const openRes = openPositionMath(
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
    // openPositionMath always computes deltaSize = mana * leverage, so the
    // fee credited here was priced on exactly this deltaSize (the N0 → N1
    // integral above). Checks below run on the fee-credited state — the one
    // that gets persisted.
    const feeAccrued = accruePerpPositionTakerFee(
      openRes.state,
      openRes.position,
      openFee
    )
    const open = {
      ...openRes,
      ...feeAccrued,
      state: creditPerpPoolFee(feeAccrued.state, direction, openFee),
    }

    // A fresh position has no unrealized profit, so the instantaneous solvency
    // factor alone cannot bound its future claim. Cap aggregate side exposure
    // against the same unreserved opposing-pool cover used by ADL. Existing
    // over-cap positions can always close, but cannot add further exposure.
    const capacity = getPerpOpenInterestCapacity(direction, open.state, price)
    if (!capacity.isWithinLimit) {
      // The limit depends only on the opposing SIDE (its pool and its own
      // exposure), which an open on this side never touches, so pre-trade
      // headroom is exact — tell the user the largest trade that fits instead
      // of making them reverse-engineer the cap.
      const headroom = Math.max(
        capacity.limit - (capacity.openInterest - open.deltaSize),
        0
      )
      const opposite = direction === 'long' ? 'short' : 'long'
      throw new APIError(
        400,
        `This market can take on at most M$${headroom.toFixed(
          2
        )} more ${direction} exposure right now, but this trade adds M$${open.deltaSize.toFixed(
          2
        )} (margin × leverage). Reduce your margin or leverage so their product fits, or wait for more ${opposite} interest to raise the cap (${direction} exposure is limited to ${PERP_OPEN_INTEREST_COVER_MULTIPLE}× the unreserved ${opposite}-side pool, plus the notional the ${opposite} side already has at risk).`
      )
    }

    // Post-trade solvency must be >= 1, by the same test the engine's own
    // assert uses: a relative tolerance plus absolute float dust. ADL
    // deliberately scales winners so the factor lands at EXACTLY 1, so after
    // any ADL event the book sits on the boundary within float dust — a strict
    // `< 1` then rejects every open on the winning side with "solvency 1.000
    // < 1" (a new position has zero unrealized PnL and cannot move the factor
    // at all).
    if (!isPerpSideSolvent(direction, open.state, price)) {
      const solv = solvencyFactor(direction, open.state, price)
      throw new APIError(
        400,
        `Post-trade solvency ${solv.toFixed(6)} < 1; try lower leverage or size`
      )
    }

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
        fee: openFee,
        // The EFFECTIVE (average) rate this add actually paid — base plus the
        // integrated size term — not the configured base alone. feeBase and
        // feeImpact snapshot the config at trade time; poolShareAfter is the
        // position's share of the (net-of-own) depth it was priced against.
        feeBps: openFeeDetails.effectiveBps,
        feeBase: takerFeeBps,
        feeImpact: takerFeeImpact,
        poolShareAfter: openFeeDetails.poolShareAfter,
        ...(isApi ? { isApi: true } : {}),
        ...(idempotencyKey
          ? {
              idempotencyKey,
              request: { direction, mana, leverage },
              response: {
                position: open.position,
                fee: openFee,
                feeBps: openFeeDetails.effectiveBps,
                poolShareAfter: openFeeDetails.poolShareAfter,
              },
            }
          : {}),
      },
      appliedTime: now,
      ts: now,
      oraclePrice: price,
    })

    // Cross-market discovery volume measures mana put at risk, matching the
    // amount-based volume used by ordinary markets. Leveraged notional remains
    // available in the event's sizeDelta, but counting it here would let a
    // tiny 100x trade buy the same ranking weight as 100x the committed mana.
    // A flip is a close plus an open, so count both margin legs.
    const tradeVolume = mana + (existingOpposite?.originalCostBasis ?? 0)
    // Fees are pool subsidy, tracked under liquidityFee — the slot for fees
    // paid into a market's liquidity rather than to the platform or creator.
    const feesCollected = openFee
    const collectedFees =
      feesCollected > 0
        ? {
            ...(contract.collectedFees ?? noFees),
            liquidityFee:
              (contract.collectedFees?.liquidityFee ?? 0) + feesCollected,
          }
        : undefined
    const contractPatch = removeUndefinedProps({
      collectedFees,
      poolLong: open.state.pool.L,
      poolShort: open.state.pool.S,
      ...openInterestPatch(open.state.positions),
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
            pricePnl: closePricePnl,
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

    // Open-side taker fee: real mana user -> contract escrow, credited to
    // the trader's side pool above. This is the only fee — closing is free.
    if (openFee > 0) {
      await runTxnOutsideBetQueue(
        pgTrans,
        {
          category: 'PERP_TAKER_FEE',
          fromId: userId,
          fromType: 'USER',
          toId: contractId,
          toType: 'CONTRACT',
          amount: openFee,
          token: 'M$',
          data: {
            direction,
            // Effective rate actually paid; feeBase is the configured flat
            // component (they differ once takerFeeImpact > 0 and size matters).
            feeBps: openFeeDetails.effectiveBps,
            feeBase: takerFeeBps,
            sizeDelta: open.deltaSize,
          },
        },
        true
      )
    }

    await assertPerpEscrowBalance(pgTrans, contractId, open.state.pool)

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

    return {
      position: open.position,
      event,
      fee: feesCollected,
      feeBps: openFeeDetails.effectiveBps,
      poolShareAfter: openFeeDetails.poolShareAfter,
      isNewUniqueBettor,
      replayed: false,
    }
  })(executionTx)
}

// -----------------------------------------------------------------------
// close
// -----------------------------------------------------------------------

const executePerpClose = async (
  contractId: string,
  userId: string,
  direction: PerpDirection,
  idempotencyKey: string | undefined,
  expectedOpenedTime: number | undefined,
  /** See `openOrAddPosition`. */
  isApi: boolean,
  /** Fraction of the position to close; 1 (the default) closes all of it.
   * The engine may still close the whole position when the remainder would
   * be dust — the returned `fraction` is what actually happened. */
  requestedFraction: number,
  /** Optimistic-concurrency token for a PARTIAL close: the notional the
   * caller believed it was taking a fraction OF. See the check below. */
  expectedSize: number | undefined,
  executionTx: SupabaseTransaction
) => {
  assertIdempotencyKey(idempotencyKey)
  if (
    expectedOpenedTime !== undefined &&
    (!Number.isFinite(expectedOpenedTime) ||
      !Number.isInteger(expectedOpenedTime) ||
      expectedOpenedTime < 0)
  ) {
    throw new APIError(400, 'Invalid expected PERP position opening time')
  }
  // Mirrors resolvePerpCloseFraction's own bounds, but as a 400 and before
  // any I/O: the pure helper throws plain Errors because it is also reached
  // from paths where a bad fraction is an invariant violation, not a request.
  if (
    !Number.isFinite(requestedFraction) ||
    requestedFraction <= 0 ||
    requestedFraction > 1
  )
    throw new APIError(400, 'Close fraction must be a number in (0, 1]')
  if (requestedFraction < 1 && requestedFraction < PERP_MIN_CLOSE_FRACTION)
    throw new APIError(
      400,
      `Close fraction must be at least ${PERP_MIN_CLOSE_FRACTION} (or exactly 1 to close the whole position)`
    )
  if (
    expectedSize !== undefined &&
    (!Number.isFinite(expectedSize) || expectedSize <= 0)
  )
    throw new APIError(400, 'Expected position size must be a positive number')
  const fractionRequestsPartialClose = requestedFraction < 1
  // The schema already requires it; this is the same rule stated where the
  // trade is actually executed, so a non-HTTP caller cannot skip the guard.
  if (fractionRequestsPartialClose && expectedSize === undefined)
    throw new APIError(
      400,
      'Closing part of a position requires the expected position size'
    )

  return (async (pgTrans: SupabaseTransaction) => {
    if (idempotencyKey) {
      const stored = await getIdempotentEvent(
        pgTrans,
        contractId,
        userId,
        idempotencyKey,
        ['close']
      )
      if (stored) {
        const data = asRecord(stored.data)
        const request = asRecord(data?.request)
        const response = asRecord(data?.response)
        const storedExpectedOpenedTime =
          request?.expectedOpenedTime === undefined
            ? undefined
            : finiteNumber(
                request.expectedOpenedTime,
                'expected position opening time'
              )
        // Closes stored before partial closes existed carry no fraction and
        // were necessarily whole-position ones.
        const storedRequestedFraction =
          request?.fraction === undefined
            ? 1
            : finiteNumber(request.fraction, 'close fraction')
        const storedExpectedSize =
          request?.expectedSize === undefined
            ? undefined
            : finiteNumber(request.expectedSize, 'expected position size')
        if (
          request?.direction !== direction ||
          storedExpectedOpenedTime !== expectedOpenedTime ||
          storedRequestedFraction !== requestedFraction ||
          storedExpectedSize !== expectedSize
        ) {
          throw new APIError(
            409,
            'This PERP idempotency key was already used for a different close'
          )
        }
        const payout = finiteNumber(response?.payout, 'close payout')
        // The fraction actually closed, which the dust-promotion rule can
        // lift above the requested one.
        const closedFraction =
          response?.fraction === undefined
            ? 1
            : finiteNumber(response.fraction, 'closed fraction')
        const remainingSize =
          response?.remainingSize === undefined
            ? 0
            : finiteNumber(response.remainingSize, 'remaining position size')
        const originalCostBasis =
          typeof data?.originalCostBasis === 'number' &&
          Number.isFinite(data.originalCostBasis) &&
          data.originalCostBasis >= 0
            ? data.originalCostBasis
            : undefined
        const takerFeeCostBasis =
          data?.takerFeeCostBasis === undefined
            ? 0
            : finiteNumber(data.takerFeeCostBasis, 'close taker fee cost basis')
        if (takerFeeCostBasis < 0)
          throw new APIError(
            500,
            'Invalid close taker fee cost basis in PERP idempotency record'
          )
        return {
          payout,
          pnl:
            originalCostBasis === undefined
              ? finiteNumber(response?.pnl, 'close PnL')
              : getUserFacingPnlFromPayout(
                  payout,
                  originalCostBasis,
                  takerFeeCostBasis
                ),
          fraction: closedFraction,
          remainingSize,
          // Callers must not re-run trade side effects (streaks) for a
          // replay — no trade happened on this request.
          replayed: true,
        }
      }
    }

    const { contract, state } = await loadStateForUpdate(pgTrans, contractId)

    // A close moves M$ out of contract escrow, so it is gated exactly like
    // an ordinary share SELL (see fetchContractBetDataAndValidate). In
    // particular the DB-level halt applies: toggle-system-status is the
    // instant incident switch, whereas PERP_TRADING_MODE=halted needs every
    // API instance rolled. Without this, a halt stopped opens and flips
    // (which route through openOrAddPosition) but left plain closes able to
    // drain escrow at a cached — possibly poisoned — oracle price.
    //
    // Scheduler-driven exits are deliberately NOT gated here: liquidation,
    // ADL and resolution call the internal paths directly, so risk
    // processing continues during a halt and positions still settle.
    const systemStatus = await pgTrans.oneOrNone<{ status: boolean }>(
      `select status from system_trading_status where token = $1`,
      [contract.token]
    )
    if (!systemStatus?.status) {
      throw new APIError(
        403,
        `Trading with ${contract.token} is currently disabled.`
      )
    }

    const closer = await pgTrans.oneOrNone<{
      id: string
      data: { userDeleted?: boolean } | null
    }>(`select id, data from users where id = $1`, [userId])
    if (!closer) throw new APIError(404, `User ${userId} not found`)
    if (closer.data?.userDeleted || BANNED_TRADING_USER_IDS.includes(closer.id))
      throw new APIError(403, 'You are banned or deleted.')

    const closerBans = await pgTrans.manyOrNone<UserBan>(
      `select *
       from user_bans
       where user_id = $1
         and ended_at is null
         and (end_time is null or end_time > now())`,
      [userId]
    )
    if (isUserBanned(closerBans, 'trading')) {
      const message = getUserBanMessage(closerBans, 'trading')
      throw new APIError(
        403,
        message
          ? `You are banned from trading. Reason: ${message}`
          : 'You are banned from trading'
      )
    }

    // Same fail-closed guard as the open path, and for the same reason: the
    // close math reads entryPrice through getUnrealizedEquity, and
    // assertPerpStateSolvent below runs on state the row has already left.
    // Ahead of the `size > 0` selection so a malformed row reports as corrupt
    // rather than as "no open position".
    assertUserPerpRowsSound(state, userId)

    const position = state.positions.find(
      (p) => p.userId === userId && p.direction === direction && p.size > 0
    )
    if (!position) throw new APIError(404, 'No open position to close')
    if (
      expectedOpenedTime !== undefined &&
      position.openedTime !== expectedOpenedTime
    ) {
      throw new APIError(
        409,
        'This position changed after the page loaded. Refresh before closing it.'
      )
    }
    // A partial close is a fraction OF something, and `expectedOpenedTime`
    // cannot police what that something was: the survivor of a partial close
    // keeps its openedTime, so a second request sized against the pre-close
    // row passes that check and then applies its fraction to the smaller row —
    // closing far less than was previewed, silently. (Two tabs both showing
    // 400 and both sending 75%: the first leaves 100, the second takes 75 of
    // that instead of the 300 it displayed.) Funding and ADL move `size` the
    // same way, and invalidate the preview for the same reason.
    //
    // Full closes deliberately skip this. "Close everything" is unambiguous at
    // any size, and a spurious 409 on the one operation a trader may urgently
    // need is a worse failure than any it would prevent.
    if (
      fractionRequestsPartialClose &&
      expectedSize !== undefined &&
      !perpSizeMatchesExpectation(position.size, expectedSize)
    ) {
      throw new APIError(
        409,
        'This position changed after the page loaded. Refresh before closing part of it.'
      )
    }

    // A stale feed would let a user cherry-pick a favorable cached price after
    // watching the real market move. Opens and closes share one predicate.
    const now = Date.now()
    assertFreshOracleForTrading(contract, now)
    assertPerpNotSolvencyHalted(contract)

    await assertPerpEscrowBalance(pgTrans, contractId, state.pool)

    const price = contract.oraclePrice
    // The requested fraction is resolved against the row the transaction
    // actually loaded, so a close sized off a stale page still promotes to a
    // full one rather than stranding dust.
    const fraction = resolvePerpCloseFraction(position, requestedFraction)
    // No fee on close: the taker fee is charged in full at open (see
    // openOrAddPosition), so exits pay out untouched. The opening fees the
    // position accumulated still land in this close's user-facing pnl via
    // takerFeeCostBasis — a partial close realizes its own share of them.
    const result = closePositionMath(state, position, price, fraction, now)
    const payout = result.payout
    // Defence in depth: PERP_MIN_CLOSE_FRACTION and the row soundness check
    // above already make this unreachable. A close that moves nothing must
    // not write an event or earn a streak.
    if (!(result.closedSize > 0) || !(result.closedCostBasis > 0))
      throw new APIError(
        400,
        'That fraction is too small to change this position'
      )
    assertPerpStateSolvent(result.state, price)
    const userPnl = getUserFacingPnlFromPayout(
      payout,
      result.closedOriginalCostBasis,
      result.closedTakerFeeCostBasis
    )
    const remainingSize = result.remainingPosition?.size ?? 0

    const event: PerpEvent = asEvent(contract, {
      userId,
      eventType: 'close',
      direction,
      // The survivor's leverage, which the split leaves unchanged; 0 when the
      // whole position went.
      leverage: result.remainingPosition?.leverage ?? 0,
      sizeDelta: -result.closedSize,
      costBasisDelta: -result.closedCostBasis,
      originalCostBasisDelta: -result.closedOriginalCostBasis,
      data: {
        payout,
        pnl: userPnl,
        pricePnl: result.pnl,
        entryPrice: position.entryPrice,
        closePrice: price,
        originalCostBasis: result.closedOriginalCostBasis,
        takerFeeCostBasis: result.closedTakerFeeCostBasis,
        // Stamped on every close, so a reader never has to infer "whole
        // position" from the absence of a field.
        fraction: result.fraction,
        remainingSize,
        ...(isApi ? { isApi: true } : {}),
        ...(idempotencyKey
          ? {
              idempotencyKey,
              // The REQUESTED fraction: it is what a replay is compared
              // against, and it can differ from the one actually closed.
              request: {
                direction,
                expectedOpenedTime,
                fraction: requestedFraction,
                ...(expectedSize === undefined ? {} : { expectedSize }),
              },
              response: {
                payout,
                pnl: userPnl,
                fraction: result.fraction,
                remainingSize,
              },
            }
          : {}),
      },
      appliedTime: now,
      ts: now,
      oraclePrice: price,
    })

    const contractPatch = removeUndefinedProps({
      poolLong: result.state.pool.L,
      poolShort: result.state.pool.S,
      ...openInterestPatch(result.state.positions),
      lastBetTime: now,
      lastUpdatedTime: now,
      // Only the margin this close actually realized counts as volume.
      volume: (contract.volume ?? 0) + result.closedOriginalCostBasis,
      volume24Hours:
        (contract.volume24Hours ?? 0) + result.closedOriginalCostBasis,
    })

    // Credit user balance.
    if (payout > 0) {
      await runTxnOutsideBetQueue(
        pgTrans,
        {
          category: 'PERP_CLOSE_PAYOUT',
          fromId: contractId,
          fromType: 'CONTRACT',
          toId: userId,
          toType: 'USER',
          amount: payout,
          token: 'M$',
          data: {
            direction,
            pnl: userPnl,
            pricePnl: result.pnl,
            entryPrice: position.entryPrice,
            closePrice: price,
            reason: result.remainingPosition ? 'partial-close' : 'close',
          },
        },
        true
      )
    }

    await assertPerpEscrowBalance(pgTrans, contractId, result.state.pool)

    const metricsQuery = await buildPerpUserContractMetricsQuery(pgTrans, {
      contract: { ...contract, ...contractPatch } as PerpContract,
      userIds: [userId],
      newEvents: [event],
      finalPositions: result.state.positions,
    })

    await pgTrans.multi(
      [
        // A partial close leaves the row open — same entry price, same
        // leverage, same liquidation price, smaller — so it is an upsert, not
        // a delete.
        result.remainingPosition
          ? upsertPositionsQuery([result.remainingPosition])
          : deletePositionsQuery(contractId, [{ userId, direction }]),
        insertPerpEventsQuery([event]),
        mergeContractDataQuery(contractId, contractPatch),
        metricsQuery,
      ].join(';\n')
    )

    return {
      payout,
      pnl: userPnl,
      fraction: result.fraction,
      remainingSize,
      replayed: false,
    }
  })(executionTx)
}

// -----------------------------------------------------------------------
// pool subsidy (admin top-up)
// -----------------------------------------------------------------------

/**
 * Add mana to one side's backing pool of a live perp, paid from the funder's
 * balance.
 *
 * Ops tool for restoring a side's margin cover: a side's pool can fall below
 * that side's aggregate cost basis when realized profits were paid against
 * opposing unrealized losses that later recovered (UK carbon, 2026-08-07) —
 * a state ADL cannot repair because it never touches cost bases, so every
 * oracle apply fail-closes and the market freezes at a stale price.
 *
 * Runs under the same advisory lock + serializable transaction as every
 * other pool mutation, so it cannot race the oracle tick, funding, or
 * trades. The funder pays with a real ADD_SUBSIDY transaction so
 * assertPerpEscrowBalance remains a checkable invariant.
 */
export const addPerpPoolSubsidy = async (
  contractId: string,
  funderId: string,
  side: PerpDirection | 'both',
  amount: number,
  options?: {
    idempotencyKey?: string
    authorize?: (
      tx: SupabaseTransaction,
      contract: PerpContract
    ) => Promise<void>
  }
) => {
  if (!Number.isFinite(amount) || amount <= 0)
    throw new APIError(400, 'amount must be a finite positive number')

  assertIdempotencyKey(options?.idempotencyKey)
  const total = amount * (side === 'both' ? 2 : 1)

  return runPerpTransaction(async (pgTrans) => {
    // Serialize against every other engine writer. Permit reading a resolved
    // contract only to recover a committed request; new payments are refused
    // below, before any debit. Non-MANA tokens are always rejected.
    const { contract, state } = await loadStateForUpdate(
      pgTrans,
      contractId,
      true
    )

    await options?.authorize?.(pgTrans, contract)
    // The contract lock serializes duplicate requests. The ledger entry and
    // pool change commit together; txns.data has a legacy extra data level.
    if (options?.idempotencyKey) {
      const prior = await pgTrans.oneOrNone<{ amount: number; side: string }>(
        `select amount, data->'data'->>'side' as side from txns
          where from_id = $1 and to_id = $2 and category = 'ADD_SUBSIDY'
            and token = 'M$' and from_type = 'USER' and to_type = 'CONTRACT'
            and data->'data'->>'idempotencyKey' = $3 limit 1`,
        [funderId, contractId, options.idempotencyKey]
      )
      if (prior) {
        if (Number(prior.amount) !== total || prior.side !== side)
          throw new APIError(
            409,
            'This subsidy request key was already used for a different amount or side.'
          )
        return {
          contract,
          poolLong: state.pool.L,
          poolShort: state.pool.S,
          replayed: true,
        }
      }
    }

    if (contract.isResolved)
      throw new APIError(400, `Contract ${contractId} is resolved`)

    const funder = await pgTrans.oneOrNone<{ id: string; balance: number }>(
      `select id, balance from users where id = $1 for update`,
      [funderId]
    )
    if (!funder) throw new APIError(404, `User ${funderId} not found`)
    if (!Number.isFinite(funder.balance) || funder.balance < total)
      throw new APIError(
        403,
        `Insufficient balance: needed ${total}, have ${funder.balance}`
      )

    await assertPerpEscrowBalance(pgTrans, contractId, state.pool)

    await runTxnOutsideBetQueue(pgTrans, {
      category: 'ADD_SUBSIDY',
      fromId: funderId,
      fromType: 'USER',
      toId: contractId,
      toType: 'CONTRACT',
      amount: total,
      token: 'M$',
      data: {
        side,
        reason: 'perp-pool-subsidy',
        ...(options?.idempotencyKey
          ? { idempotencyKey: options.idempotencyKey }
          : {}),
      },
    })

    const pool = {
      L: state.pool.L + (side === 'long' || side === 'both' ? amount : 0),
      S: state.pool.S + (side === 'short' || side === 'both' ? amount : 0),
    }
    await assertPerpEscrowBalance(pgTrans, contractId, pool)

    // mergeContractDataQuery ends in `returning *` — .one(), not .none()
    // (see the fast path in runOracleUpdate for the failure mode).
    await pgTrans.one(
      mergeContractDataQuery(contractId, {
        poolLong: pool.L,
        poolShort: pool.S,
        lastUpdatedTime: Date.now(),
      })
    )

    return { contract, poolLong: pool.L, poolShort: pool.S, replayed: false }
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
  oracleFeedHealth?: OracleFeedHealth
  liquidated: PerpPosition[]
  adlAdjusted: AdlNotificationResult['adlAdjusted']
  adlSettled: AdlNotificationResult['adlSettled']
  adlFactorLong: number
  adlFactorShort: number
  poolLongBefore: number
  poolLongAfter: number
  poolShortBefore: number
  poolShortAfter: number
  /**
   * Present only when the tick committed its price but NOT its state, because
   * the post-transition book could not be made solvent. Callers log this with
   * their own prefix so the existing alert policies still fire.
   */
  solvencyHalt?: { reason: string }
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
  appliedTime: number,
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
          appliedTime,
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
          pnl: getUserFacingPnlFromPayout(
            payout,
            position.originalCostBasis,
            position.takerFeeCostBasis
          ),
          entryPrice: position.entryPrice,
          originalCostBasis: position.originalCostBasis,
          takerFeeCostBasis: position.takerFeeCostBasis ?? 0,
          reason: 'factor-zero-settlement',
        },
        appliedTime,
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
      appliedTime,
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
          pnl: getUserFacingPnlFromPayout(
            payout,
            position.originalCostBasis,
            position.takerFeeCostBasis
          ),
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
export const applyOracleUpdate = (
  contract: PerpContract,
  state: PerpState,
  newPrice: number,
  ts: number,
  appliedTime: number
) => {
  // Structure first, on the INPUT. Liquidation and ADL both drop or zero
  // rows, so a malformed row that reaches them is gone by the time the
  // post-transition assert runs — and that assert then passes on a state the
  // corrupt row has already left, exactly as it did on the close paths.
  // Deliberately the numbers-only check, NOT assertPerpStateSolvent: these
  // two transitions exist to repair legitimate insolvency, so asserting
  // solvency on their input would fail closed on the states they are here to
  // fix. Solvency is still asserted on the OUTPUT below.
  assertPerpStateNumbers(state, newPrice)

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
          pnl: getUserFacingPnlFromPayout(
            0,
            liq.originalCostBasis,
            liq.takerFeeCostBasis
          ),
          entryPrice: liq.entryPrice,
          liquidationPrice: liq.liquidationPrice,
          originalCostBasis: liq.originalCostBasis,
          takerFeeCostBasis: liq.takerFeeCostBasis ?? 0,
          payout: 0, // margin forfeited to pool
        },
        appliedTime,
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
    appliedTime,
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

// N3. An order is owed the first eligible price after it, and settlement at a
// later point rejects it as having missed that one. So the mark advances only
// once nothing still waits on it: no order eligible at the current mark (a
// burst past the follow-up budget, a failed or abandoned follow-up, an order
// committed while that tick ran) and no persisted point the mark skipped while
// an order waits on it (an overlapping scheduler applied a newer point first,
// or an apply failed after its point was persisted). The tick checks under the
// contract lock, before writing anything, so no other writer can land a point
// or an order in between, and throws this; runOracleUpdate catches up (settles
// the mark's backlog, or replays the skipped point) and retries.
class PerpCatchUpNeeded extends Error {
  constructor(
    readonly point: OraclePoint,
    readonly skipped: boolean,
    readonly contract: PerpContract
  ) {
    super(`Orders wait at ${point.ts}; catching up before advancing`)
  }
}
// Catch-up rounds (a backlog pass or one replayed point each) before an update
// advances regardless, so waiting orders cannot hold back the mark and the
// liquidations it carries; what still waits is then rejected as before.
const MAX_CATCH_UP_ROUNDS = 6
// Shared by an incoming point's retries and the replays they run.
type OracleCatchUp = {
  // Rounds spent on the incoming point so far: one budget for all of them.
  spent: { rounds: number }
  // Orders that stayed contended through their attempts: not waited on again.
  exhausted: Set<string>
  // The incoming point's provider health, which its replays carry.
  health?: OracleFeedHealth
  // Set on a replay of a skipped point (and its retries).
  replay?: boolean
}

export const runOracleUpdate = async (
  contractId: string,
  newPrice: number,
  ts: number,
  sourceTs?: number,
  /** Fast tick only. Omit to wait; see OracleUpdateBounds. */
  bounds?: OracleUpdateBounds,
  suppliedHealth?: OracleFeedHealth,
  /** Internal to the N3 catch-up; callers omit it. */
  catchUpState?: OracleCatchUp
): Promise<OracleUpdateResult | null> => {
  const point = { price: newPrice, ts, sourceTs }
  const catchUp = catchUpState ?? {
    spent: { rounds: 0 },
    exhausted: new Set<string>(),
    health: suppliedHealth,
  }
  // A replay carries the incoming point's provider health, the current word
  // on the provider: the contract's own may be the outage the incoming point
  // recovers from, and the replay's fills check it. It answers to the
  // incoming check, refused only when that check is older than the
  // contract's, whatever health other replays or checks recorded since. It
  // records the health stamped just before that check, so the incoming apply
  // can then record the check itself.
  const replayBase = catchUp.replay ? catchUp.health : undefined
  const oracleFeedHealth = replayBase
    ? { ...replayBase, checkedAt: replayBase.checkedAt - 1 }
    : suppliedHealth
  // The provider check this update answers to.
  const checkedAt = (replayBase ?? oracleFeedHealth)?.checkedAt
  let backlog = false
  let deferredAtTick: string[] = []
  // The contract as this point's settlement saw it, when it got that far.
  let settledContract: PerpContract | undefined
  const update = await runPerpTransaction(
    async (pgTrans) => {
      // A retried attempt starts over.
      backlog = false
      deferredAtTick = []
      settledContract = undefined
      const applyTick = async () => {
        // Bounded callers fail fast rather than queue behind whoever holds the
        // contract lock. Unbounded ones keep the pre-existing behaviour exactly:
        // no SET LOCAL, no change to how long they may wait.
        if (bounds)
          await pgTrans.none(
            oracleTickTimeoutsQuery(
              bounds.lockTimeoutMs,
              bounds.statementTimeoutMs
            )
          )
        const { contract, state } = await loadStateForUpdate(
          pgTrans,
          contractId
        )

        // An older successful fetch must not clear a newer freeze/recovery.
        if (
          checkedAt != null &&
          checkedAt <= (contract.oracleFeedHealth?.checkedAt ?? 0)
        )
          return null
        if (
          oracleFeedHealth &&
          (oracleFeedHealth.status !== 'available' ||
            getPerpOracleFreshness({
              ...contract,
              oraclePrice: newPrice,
              oraclePriceTime: ts,
              oracleFeedHealth,
            }).status !== 'fresh')
        )
          return null
        // The hourly fallback has no new provider observation. It must not apply
        // a row that outlived its source health while waiting for the tick lock.
        if (
          !oracleFeedHealth &&
          contract.oracleFeedHealth &&
          getPerpOracleFreshness({
            ...contract,
            oraclePrice: newPrice,
            oraclePriceTime: ts,
          }).status !== 'fresh'
        )
          return null
        const healthPatch = oracleFeedHealth ? { oracleFeedHealth } : {}
        const resultHealth = oracleFeedHealth ?? contract.oracleFeedHealth
        const incomingPoint = { price: newPrice, ts, sourceTs }
        const currentPoint =
          contract.oraclePriceTime == null
            ? null
            : {
                price: contract.oraclePrice,
                ts: contract.oraclePriceTime,
                sourceTs: contract.oracleSourceTime ?? undefined,
              }
        const decision = decideOracleTransition(currentPoint, incomingPoint)
        if (decision.action === 'reject')
          throw new APIError(
            400,
            `Invalid oracle transition: ${decision.reason}`
          )

        // A halted contract MUST be allowed to re-run the same point. The halt
        // committed the price without the transition, so from here on that point
        // reads as a duplicate and is ignored — which would strand the contract
        // permanently: the pending liquidations/ADL would never be applied and
        // the halt would never clear, no matter how much subsidy an operator
        // added. This retry is what makes recovery converge. Restricted to an
        // exact duplicate; a genuinely stale (older) point stays ignored.
        const retryingHalt =
          decision.action === 'ignore' &&
          decision.reason === 'duplicate' &&
          contract.solvencyHaltTime != null

        // Delivery can race even though state writes cannot. Once the contract
        // lock is held, an older point or exact retry must not touch price, pools,
        // positions, metrics, or event history.
        if (decision.action === 'ignore' && !retryingHalt) {
          if (
            decision.reason !== 'duplicate' ||
            !oracleFeedHealth ||
            !shouldRefreshOracleHealth(
              contract.oracleFeedHealth,
              oracleFeedHealth
            )
          )
            return null
          // A flat mark still needs a provider heartbeat, including recovery from
          // a frozen flag. No liquidation or funding event is replayed here.
          await pgTrans.one(mergeContractDataQuery(contractId, healthPatch))
          return {
            oracleFeedHealth: resultHealth,
            liquidated: [],
            adlAdjusted: [],
            adlSettled: [],
            adlFactorLong: 1,
            adlFactorShort: 1,
            poolLongBefore: state.pool.L,
            poolLongAfter: state.pool.L,
            poolShortBefore: state.pool.S,
            poolShortAfter: state.pool.S,
          }
        }

        // N3 (see PerpCatchUpNeeded): nothing is written yet, so throwing here
        // rolls back only this attempt.
        if (
          currentPoint &&
          ts > currentPoint.ts &&
          contract.solvencyHaltTime == null &&
          catchUp.spent.rounds < MAX_CATCH_UP_ROUNDS &&
          (await hasPendingPerpOrders(pgTrans, contractId))
        ) {
          if (
            await hasEligiblePendingPerpOrder(
              pgTrans,
              contract,
              currentPoint,
              catchUp.exhausted
            )
          )
            throw new PerpCatchUpNeeded(currentPoint, false, contract)
          const skipped = await findSkippedPerpObservation(
            pgTrans,
            contract,
            currentPoint.ts,
            ts
          )
          if (skipped) throw new PerpCatchUpNeeded(skipped, true, contract)
        }

        const poolLongBefore = state.pool.L
        const poolShortBefore = state.pool.S

        const appliedTime = Date.now()
        let applied: ReturnType<typeof applyOracleUpdate>
        try {
          applied = applyOracleUpdate(
            contract,
            state,
            newPrice,
            ts,
            appliedTime
          )
        } catch (error) {
          // LIVENESS. An accounting assert must never be able to take out price
          // discovery. Before this, a post-transition state that failed
          // assertPerpStateSolvent rolled the whole transaction back, so the
          // cached mark never moved again and EVERY subsequent tick re-derived
          // the same failure from the same state — a permanent wedge that only
          // an operator could clear (UK carbon 2026-08-07, 12h; OpenRouter
          // open-weight share 2026-08-29, 12h).
          //
          // A frozen mark is strictly worse than the state it refuses to write:
          // it is wrong on the screen, it keeps trading open against a dead
          // price until the freshness budget expires, and it grows the very
          // deficit it is failing on. So commit the price and halt trading
          // explicitly instead.
          //
          // Deliberately NOT written: pools, positions, metrics, events. The
          // pending liquidations and ADL stay pending and are re-derived by the
          // next tick against the newer price — a position whose liquidation is
          // deferred this way can escape it if the price rebounds, which is a
          // real but small transfer, and the alternative on the table is a
          // market that is dark for hours. Trading is halted throughout, so
          // nobody can act on the gap.
          const reason = error instanceof Error ? error.message : String(error)
          await pgTrans.one(
            mergeContractDataQuery(contractId, {
              ...healthPatch,
              oraclePrice: newPrice,
              oraclePriceTime: ts,
              oracleSourceTime: sourceTs ?? null,
              // Keep the ORIGINAL halt time across retries so an operator can
              // see how long this book has been wedged, not how long ago the
              // last retry ran.
              solvencyHaltTime: contract.solvencyHaltTime ?? appliedTime,
              solvencyHaltReason: reason,
            })
          )
          return {
            oracleFeedHealth: resultHealth,
            liquidated: [],
            adlAdjusted: [],
            adlSettled: [],
            adlFactorLong: 1,
            adlFactorShort: 1,
            poolLongBefore,
            poolLongAfter: poolLongBefore,
            poolShortBefore,
            poolShortAfter: poolShortBefore,
            solvencyHalt: { reason },
          }
        }

        const { upserts, deletes } = diffForWrite(
          state.positions,
          applied.finalState.positions
        )

        const contractPatch = removeUndefinedProps({
          ...healthPatch,
          poolLong: applied.finalState.pool.L,
          poolShort: applied.finalState.pool.S,
          ...openInterestPatch(applied.finalState.positions),
          oraclePrice: newPrice,
          oraclePriceTime: ts,
          // null deliberately clears metadata if a newer point does not carry it;
          // retaining the previous point's source time would misattribute data.
          oracleSourceTime: sourceTs ?? null,
          // Price polling is infrastructure activity, not user activity. Only a
          // liquidation/ADL transition should refresh discovery freshness.
          lastUpdatedTime: applied.events.length > 0 ? ts : undefined,
          // This tick represented its own result, so whatever wedged the book is
          // gone (typically an add-perp-subsidy top-up). Self-heal rather than
          // needing a second operator action. `undefined` when not halted so the
          // common path writes nothing extra.
          ...(contract.solvencyHaltTime == null
            ? {}
            : { solvencyHaltTime: null, solvencyHaltReason: null }),
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
            oracleFeedHealth: resultHealth,
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

        if (applied.adlSettled.length > 0) {
          await assertPerpEscrowBalance(pgTrans, contractId, state.pool)
        }
        await payAdlSettlements(
          pgTrans,
          contractId,
          newPrice,
          applied.adlSettled
        )
        if (applied.adlSettled.length > 0) {
          await assertPerpEscrowBalance(
            pgTrans,
            contractId,
            applied.finalState.pool
          )
        }

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
          oracleFeedHealth: resultHealth,
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
      }
      const result = await applyTick()
      if (result && !result.solvencyHalt) {
        const row = await pgTrans.oneOrNone<{ data: PerpContract }>(
          'select data from contracts where id=$1',
          [contractId]
        )
        if (!row) throw new Error('Perp disappeared during execution')
        const settled = await settlePendingPerpOrders(
          pgTrans,
          row.data,
          point,
          executeQueuedPerpOrder
        )
        backlog = settled.deferred.length + settled.remaining > 0
        deferredAtTick = settled.deferred
        settledContract = row.data
        const current = await pgTrans.oneOrNone<{ data: PerpContract }>(
          'select data from contracts where id=$1',
          [contractId]
        )
        if (!current) throw new Error('Perp disappeared after execution')
        return {
          ...result,
          poolLongAfter: current.data.poolLong,
          poolShortAfter: current.data.poolShort,
        }
      }
      return result
    },
    bounds?.maxAttempts,
    // Timeouts: only a bounded caller can produce these, and it handles them
    // itself. The catch-up signal is handled below. Anything else is ERROR.
    {
      isExpectedError: (error) =>
        error instanceof PerpCatchUpNeeded ||
        (!!bounds && isOracleTickTimeout(error)),
      ...(bounds ? { tag: FAST_TICK_TX_TAG } : {}),
    }
  ).catch((error: unknown) => {
    if (error instanceof PerpCatchUpNeeded) return error
    throw error
  })
  if (update instanceof PerpCatchUpNeeded) {
    catchUp.spent.rounds++
    await catchUpTo(update, catchUp, bounds)
    return runOracleUpdate(
      contractId,
      newPrice,
      ts,
      sourceTs,
      bounds,
      suppliedHealth,
      catchUp
    )
  }
  // Orders the tick deferred (contention) or did not reach (the settlement
  // cap), and orders that committed after it read the queue, still fill at
  // this price before this feed's next tick can move it. Bounded as the tick
  // is: whatever a busy lock leaves, the next update catches up first.
  if (
    settledContract &&
    (backlog || (await backlogRemainsAt(settledContract, point)))
  )
    await settleBacklogAtPoint(
      contractId,
      point,
      deferredAtTick,
      catchUp.exhausted,
      bounds
    )
  return update
}

// One catch-up round (see PerpCatchUpNeeded): settle the mark's backlog, or
// replay the skipped point as an update of its own. Bounded as the update is.
const catchUpTo = async (
  needed: PerpCatchUpNeeded,
  catchUp: OracleCatchUp,
  bounds: OracleUpdateBounds | undefined
) => {
  const { contract, point } = needed
  if (!needed.skipped) {
    await settleBacklogAtPoint(
      contract.id,
      point,
      [],
      catchUp.exhausted,
      bounds
    )
    return
  }
  // Carries the incoming point's health (see runOracleUpdate).
  const replayed = await runOracleUpdate(
    contract.id,
    point.price,
    point.ts,
    point.sourceTs,
    bounds,
    undefined,
    { ...catchUp, replay: true }
  ).catch((error) => {
    log.warn(
      `[perp-orders] replaying skipped point ${contract.id} @ ${point.ts} failed: ${error}`
    )
    return null
  })
  // Liquidations and ADL at the replayed point happened at its own price,
  // and callers notify only for the point they applied.
  if (replayed) {
    try {
      await notifyPerpOracleResult(
        createSupabaseDirectClient(),
        contract,
        point.price,
        replayed
      )
    } catch (error) {
      log.error(
        `[perp-orders] notifications for replayed point ${contract.id} @ ${point.ts} failed: ${error}`
      )
    }
  }
}

// Whether orders still wait at `point` once its tick has committed. The tick
// is done either way: a failed check leaves them to the next update's
// catch-up.
const backlogRemainsAt = async (contract: PerpContract, point: OraclePoint) => {
  try {
    return await hasEligiblePendingPerpOrder(
      createSupabaseDirectClient(),
      contract,
      point
    )
  } catch (error) {
    log.warn(
      `[perp-orders] backlog check for ${contract.id} @ ${point.ts} failed; the next update catches up: ${error}`
    )
    return false
  }
}

const lockPerpContract = async (
  pgTrans: SupabaseTransaction,
  contractId: string
) => {
  await pgTrans.one(advisoryLockQuery(contractId))
  const row = await pgTrans.one<{ data: PerpContract }>(
    selectContractForUpdateQuery(contractId)
  )
  return row.data
}

// Settles pending orders at `point` only while it is still the contract's
// mark; once a newer tick lands, that tick settles them. Waits for the
// contract lock (these orders are owed this price) unless the caller is
// bounded; settlement itself bounds row waits.
const settleAtPoint = (
  contractId: string,
  point: OraclePoint,
  skip: ReadonlySet<string>,
  bounds?: OracleUpdateBounds
) =>
  runPerpTransaction(
    async (pgTrans) => {
      if (bounds)
        await pgTrans.none(
          oracleTickTimeoutsQuery(
            bounds.lockTimeoutMs,
            bounds.statementTimeoutMs
          )
        )
      const contract = await lockPerpContract(pgTrans, contractId)
      if (
        contract.oraclePriceTime !== point.ts ||
        contract.solvencyHaltTime != null
      )
        return null
      return settlePendingPerpOrders(
        pgTrans,
        contract,
        point,
        executeQueuedPerpOrder,
        { skip }
      )
    },
    bounds?.maxAttempts ?? 3,
    bounds
      ? { isExpectedError: isOracleTickTimeout, tag: FAST_TICK_TX_TAG }
      : undefined
  )

// Settles what still waits at `point`, each pass in its own fresh transaction,
// for as long as `point` is the contract's mark. A contended order is retried
// a few times, so one busy row cannot cancel its order by outlasting a single
// attempt, then marked exhausted (and skipped) so the orders behind it get
// their turn; housekeeping retries whatever is left.
const settleBacklogAtPoint = async (
  contractId: string,
  point: OraclePoint,
  deferredAtTick: string[] = [],
  exhausted = new Set<string>(),
  bounds?: OracleUpdateBounds
) => {
  const attempts = new Map(deferredAtTick.map((id) => [id, 1]))
  let backlog = true
  for (let pass = 0; backlog && pass < 50; pass++) {
    const settled = await settleAtPoint(
      contractId,
      point,
      exhausted,
      bounds
    ).catch((error) => {
      log.warn(
        `[perp-orders] follow-up settlement for ${contractId} @ ${point.ts} failed; housekeeping will retry: ${error}`
      )
      return null
    })
    if (!settled) break
    for (const id of settled.deferred) {
      const n = (attempts.get(id) ?? 0) + 1
      attempts.set(id, n)
      if (n >= 4) exhausted.add(id)
    }
    backlog =
      settled.remaining > 0 || settled.deferred.some((id) => !exhausted.has(id))
  }
}

// Scheduler housekeeping, independent of provider health: refunds orders a
// dead feed can never fill, and retries orders a contended tick left pending
// at the contract's current price. One contract's failure skips only it.
export const settlePerpOrderBacklog = async () => {
  const pg = createSupabaseDirectClient()
  // The current-price arm mirrors perpEligibilityCutoff, so a contract whose
  // mark no waiting order may use is not locked for nothing.
  const rows = await pg.manyOrNone<{ contract_id: string }>(
    `select distinct o.contract_id from perp_orders o join contracts c on c.id = o.contract_id
    where o.status = 'pending'
      and (o.expires_time <= clock_timestamp()
        or (c.data->>'isResolved')::boolean is true
        or (c.data->>'solvencyHaltTime' is null
          and o.created_time < to_timestamp((c.data->>'oraclePriceTime')::double precision / 1000)
          and ((c.data->>'oracleFeedId' not like 'mnx-%'
              and c.data->>'oracleFeedId' <> all($2::text[]))
            or ((c.data->>'oracleSourceTime')::double precision <= (c.data->>'oraclePriceTime')::double precision
              and o.created_time < to_timestamp(((c.data->>'oracleSourceTime')::double precision - $1) / 1000)))))
    limit 100`,
    [PROVIDER_SOURCE_CLOCK_ALLOWANCE_MS, PROVIDER_STAMPED_FEED_IDS]
  )
  for (const { contract_id } of rows) {
    try {
      await runPerpTransaction(async (pgTrans) => {
        // Never hold the contract lock the oracle tick needs while waiting on
        // a busy row; a timed-out order is just retried on the next pass.
        await pgTrans.none(oracleTickTimeoutsQuery(1_000, 4_000))
        const contract = await lockPerpContract(pgTrans, contract_id)
        const current =
          contract.solvencyHaltTime == null && contract.oraclePriceTime != null
            ? {
                price: contract.oraclePrice,
                ts: contract.oraclePriceTime,
                sourceTs: contract.oracleSourceTime ?? undefined,
              }
            : null
        await settlePendingPerpOrders(
          pgTrans,
          contract,
          current,
          executeQueuedPerpOrder
        )
      })
    } catch (error) {
      const message = `[perp-orders] backlog settlement failed for ${contract_id}: ${error}`
      if (isOracleTickTimeout(error)) log.warn(message)
      else log.error(message)
    }
  }
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
    const appliedTime = Date.now()

    // Read health from the locked contract, not the scheduler's earlier
    // snapshot. A long source allowance must not extend a provider outage
    // or a frozen flag into hours of funding while users cannot close.
    if (!PERPS_SKIP_ORACLE_FRESHNESS && contract.oracleFeedHealth != null) {
      const freshness = getPerpOracleFreshness(contract, appliedTime)
      if (freshness.status !== 'fresh') {
        log(
          `[perps] skipping funding for ${contract.slug}: ${
            freshness.reason ?? 'Oracle price is stale'
          }`
        )
        return null
      }
    }

    // Halt gate, read from the PERSISTED contract under the lock rather than
    // from the caller's oracle result.
    //
    // Once a tick has halted, it has already committed its price, so replaying
    // that same point returns `ignore`/null and the scheduler's per-run check
    // sees nothing to skip on. Funding would then run against positions whose
    // liquidation and ADL are still pending — and unlike the tick that refused
    // to write them, funding DOES persist pools, positions, and events. Before
    // the halt existed this was covered incidentally: the tick threw, and the
    // throw took funding down with it.
    //
    // Subsidy recovery is not blocked by this. The retried oracle tick applies
    // the pending transition and clears the halt; funding resumes on the next
    // pass, against a book that has caught up.
    if (contract.solvencyHaltTime != null) {
      log(
        `[perps] skipping funding for ${contract.slug}: solvency halt in effect since ${contract.solvencyHaltTime}`
      )
      return null
    }

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
        fundingStartTime: contract.createdTime,
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
    await assertPerpEscrowBalance(pgTrans, contractId, state.pool)

    // Open interest, NOT the pools. The pools hold margin, so their ratio
    // only tracks exposure when both sides run comparable leverage; where
    // they don't it can invert the sign and pay the crowded side (BTC and
    // the OpenRouter market were both doing exactly that before this).
    // Computed from the positions loaded under the advisory lock, never from
    // the contract's denormalized copy.
    const openInterest = getPerpOpenInterest(state.positions)
    const fundingRate = computeFundingRate(
      openInterest.long,
      openInterest.short,
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
      appliedTime,
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
      ...openInterestPatch(next.positions),
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
        const sizeDelta = p.size - before.size
        const costBasisDelta = p.costBasis - before.costBasis
        if (sizeDelta === 0 && costBasisDelta === 0) return null
        return asEvent(contract, {
          userId: p.userId,
          eventType: 'funding',
          direction: p.direction,
          leverage: p.leverage,
          sizeDelta,
          costBasisDelta,
          originalCostBasisDelta: 0,
          data: {
            fundingRate,
          },
          appliedTime,
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
    await assertPerpEscrowBalance(pgTrans, contractId, next.pool)

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
  resolverId: string,
  options?: { requireNoOpenPositions?: boolean }
): Promise<
  {
    closedPositions: {
      userId: string
      direction: PerpDirection
      payout: number
      originalCostBasis: number
      takerFeeCostBasis: number
    }[]
    residualPayout: number
    finalPrice: number
    liquidated: PerpPosition[]
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
    await settlePendingPerpOrders(
      pgTrans,
      { ...contract, isResolved: true },
      null,
      executeQueuedPerpOrder,
      { limit: Infinity }
    )
    // Operational prototype replacement can require an empty market. This
    // check runs after acquiring the same contract lock as trades, closing
    // the race between a script's read-only precheck and final resolution.
    if (options?.requireNoOpenPositions && loaded.positions.length > 0)
      throw new APIError(
        409,
        `Cannot resolve ${contract.slug}: expected no open positions, found ${loaded.positions.length}`
      )
    await assertPerpEscrowBalance(pgTrans, contractId, loaded.pool)

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
      sourceTs: contract.oracleSourceTime ?? undefined,
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
    const {
      price: finalPrice,
      ts: oracleTs,
      sourceTs: oracleSourceTime,
    } = finalPoint
    const now = Date.now()
    const applied = applyOracleUpdate(
      contract,
      loaded,
      finalPrice,
      oracleTs,
      now
    )

    const events: PerpEvent[] = [...applied.events]
    const closedPositions: {
      userId: string
      direction: PerpDirection
      payout: number
      originalCostBasis: number
      takerFeeCostBasis: number
    }[] = [
      ...applied.liquidated.map((position) => ({
        userId: position.userId,
        direction: position.direction,
        payout: 0,
        originalCostBasis: position.originalCostBasis,
        takerFeeCostBasis: position.takerFeeCostBasis ?? 0,
      })),
      ...applied.adlSettled.map(({ position, payout }) => ({
        userId: position.userId,
        direction: position.direction,
        payout,
        originalCostBasis: position.originalCostBasis,
        takerFeeCostBasis: position.takerFeeCostBasis ?? 0,
      })),
    ]

    let runningState = applied.finalState
    await payAdlSettlements(pgTrans, contractId, finalPrice, applied.adlSettled)
    for (const p of applied.finalState.positions) {
      if (p.size <= 0) continue
      const res = closePositionMath(runningState, p, finalPrice)
      runningState = res.state
      assertPerpStateSolvent(runningState, finalPrice)
      const userPnl = getUserFacingPnlFromPayout(
        res.payout,
        p.originalCostBasis,
        p.takerFeeCostBasis
      )
      closedPositions.push({
        userId: p.userId,
        direction: p.direction,
        payout: res.payout,
        originalCostBasis: p.originalCostBasis,
        takerFeeCostBasis: p.takerFeeCostBasis ?? 0,
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
            pnl: userPnl,
            pricePnl: res.pnl,
            entryPrice: p.entryPrice,
            originalCostBasis: p.originalCostBasis,
            takerFeeCostBasis: p.takerFeeCostBasis ?? 0,
            resolvedAt: finalPrice,
            reason: 'resolve-market',
          },
          appliedTime: now,
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
              pnl: userPnl,
              pricePnl: res.pnl,
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
    await assertPerpEscrowBalance(pgTrans, contractId, { L: 0, S: 0 })

    const contractPatch = removeUndefinedProps({
      poolLong: 0,
      poolShort: 0,
      // Resolution settles every open position.
      openInterestLong: 0,
      openInterestShort: 0,
      oraclePrice: finalPrice,
      oraclePriceTime: oracleTs,
      oracleSourceTime: oracleSourceTime ?? null,
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
      liquidated: applied.liquidated,
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

export const openOrAddPosition = (
  contractId: string,
  userId: string,
  direction: PerpDirection,
  mana: number,
  leverage: number,
  idempotencyKey?: string,
  isApi = false,
  maxFee?: number
) => {
  assertIdempotencyKey(idempotencyKey)
  if (!idempotencyKey) throw new APIError(400, 'An idempotency key is required')
  return enqueuePerpOrder(
    contractId,
    userId,
    { kind: 'trade', direction, mana, leverage, maxFee },
    idempotencyKey,
    isApi
  )
}
export const closePosition = (
  contractId: string,
  userId: string,
  direction: PerpDirection,
  idempotencyKey?: string,
  expectedOpenedTime?: number,
  isApi = false,
  fraction = 1,
  expectedSize?: number
) => {
  assertIdempotencyKey(idempotencyKey)
  if (!idempotencyKey) throw new APIError(400, 'An idempotency key is required')
  return enqueuePerpOrder(
    contractId,
    userId,
    { kind: 'close', direction, fraction },
    idempotencyKey,
    isApi,
    expectedOpenedTime,
    expectedSize
  )
}
const executeQueuedPerpOrder = async (
  tx: SupabaseTransaction,
  o: import('./orders').StoredOrder
) => {
  const req = o.request
  if (req.kind === 'trade') {
    const r = await executePerpTrade(
      o.contract_id,
      o.user_id,
      req.direction,
      req.mana,
      req.leverage,
      o.idempotency_key,
      o.is_api,
      req.maxFee,
      tx,
      Number(o.reserved_mana)
    )
    return {
      kind: 'trade' as const,
      position: r.position,
      fee: r.fee,
      isNewUniqueBettor: r.isNewUniqueBettor,
      feeBps: r.feeBps,
      poolShareAfter: r.poolShareAfter,
    }
  }
  const pos = await tx.one<{ size: string | number }>(
    'select size from contract_perp_positions where contract_id=$1 and user_id=$2 and direction=$3',
    [o.contract_id, o.user_id, req.direction]
  )
  const r = await executePerpClose(
    o.contract_id,
    o.user_id,
    req.direction,
    o.idempotency_key,
    Number(o.expected_opened_time),
    o.is_api,
    req.fraction,
    Number(pos.size),
    tx
  )
  return {
    kind: 'close' as const,
    payout: r.payout,
    pnl: r.pnl,
    fraction: r.fraction,
    remainingSize: r.remainingSize,
  }
}
