// ManiPerp engine — orchestrates open/close, oracle updates, funding, and
// resolution. All entry points open a serializable transaction, acquire a
// per-contract advisory lock, load pool + positions, run the pure math in
// common/src/perps/amm.ts, and write back via pgTrans.multi.
//
// This keeps the rest of place-bet / CPMM untouched.

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
  liquidationPrice as computeLiquidationPrice,
  MIN_PERP_LEVERAGE,
  openPosition as openPositionMath,
  PERP_OPEN_INTEREST_COVER_MULTIPLE,
  PERP_SOLVENCY_FACTOR_TOLERANCE,
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
  accruePerpPositionTakerFee,
  assertPerpTakerFeeConfig,
  creditPerpPoolFee,
  getPerpEffectiveTakerFeeBps,
  getPerpTakerFeeImpact,
  perpOpenFeeQuote,
  perpOwnContributionInputs,
  PERP_MAX_FEE_SHARE_OF_MARGIN,
} from 'common/perps/fees'
import { noFees } from 'common/fees'
import { getUserFacingPnlFromPayout } from 'common/perps/pnl'
import {
  decideOracleTransition,
  getOracleFreshness,
  OraclePoint,
  validateBasicOraclePoint,
} from 'common/perps/oracle'
import { removeUndefinedProps } from 'common/util/object'
import { randomStringRegex } from 'common/util/random'
import { UserBan } from 'common/user'
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
  const freshness = getOracleFreshness(
    contract.oraclePriceTime,
    contract.maxOraclePriceAgeMs,
    now
  )
  if (freshness.status === 'fresh') return

  const detail =
    freshness.status === 'stale' && freshness.ageMs != null
      ? `Oracle feed is stale (age ${freshness.ageMs}ms > ${contract.maxOraclePriceAgeMs}ms)`
      : 'Oracle feed freshness is unavailable'
  throw new APIError(
    400,
    `${detail} — trading is paused until the next valid update`
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

/**
 * A trade rejected for a reason the CALLER caused is not an engine fault.
 *
 * transactWithRetries logs every failed attempt at ERROR unless told
 * otherwise, so a market correctly refusing a trade bills as an incident —
 * eight lines per request, one per attempt. The 2026-08-22 feed latch produced
 * 1,404 ERROR lines from `Oracle feed is stale`, which is the fail-closed gate
 * doing exactly its job; it buried the real signal and inflated every
 * error-rate dashboard for the duration.
 *
 * Scoped to 4xx: a 5xx from this engine (a corrupt token, a broken escrow
 * invariant) is a genuine fault and must stay at ERROR.
 *
 * A wrapper rather than an argument at each call site, because passing options
 * makes the call three-argument, which stops prettier hugging the callback and
 * reindents both entire function bodies — a 1,600-line diff for a behavioural
 * change worth twenty. Deliberately NOT the default for runPerpTransaction:
 * runFunding is system-initiated, so a 4xx there is a genuine fault.
 */
const isClientFaultError = (err: unknown) =>
  err instanceof APIError && err.code >= 400 && err.code < 500

const runTradeTransaction = <T>(
  fn: (pgTrans: SupabaseTransaction) => Promise<T>
): Promise<T> =>
  runPerpTransaction(fn, PERP_TX_MAX_ATTEMPTS, {
    isExpectedError: isClientFaultError,
  })

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

export const openOrAddPosition = async (
  contractId: string,
  userId: string,
  direction: PerpDirection,
  mana: number,
  leverage: number,
  idempotencyKey?: string,
  /** Trade arrived via an API key rather than the site — recorded on the
   * event so readers can filter bot flow out of the Trades tab, matching
   * `bets.is_api`. Lives in `data` so no migration is needed; events written
   * before this shipped carry no flag and read as manual. */
  isApi = false,
  /** Price protection: reject (400) rather than charge when the fee computed
   * inside the locked transaction exceeds this. The fee is state-dependent
   * (pools move, config is live-tunable), so the previewed fee is not a
   * promise — this bound is how a caller makes their consent explicit. Not
   * part of the idempotency fingerprint: a replay returns the stored result
   * of a trade that already happened. */
  maxFee?: number
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

  return runTradeTransaction(async (pgTrans) => {
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
      // Speak bps of size, not mana: that is the unit the caller set the bound
      // in, and it is what makes "the fee moved" legible next to the fee they
      // were quoted. Measured drift on BTC: pool outflow puts ~0.15% of the
      // week inside a window that can move a large trade's fee, and only
      // 0.023% of 5s ticks move the mark more than 30 bps — so this should be
      // a rare "click again", not a routine wall.
      const notional = mana * leverage
      const overageBps =
        notional > 0 ? ((openFee - maxFee) / notional) * 10_000 : 0
      throw new APIError(
        400,
        `The fee moved while you were deciding: this trade costs M$${openFee.toFixed(
          2
        )} (${openFeeDetails.effectiveBps.toFixed(
          1
        )} bps of size), which is ${overageBps.toFixed(
          1
        )} bps more than the M$${maxFee.toFixed(
          2
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
    const totalDebit = mana + openFee
    const spendableBalance = trader.balance + closePayout
    if (spendableBalance < totalDebit)
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
      // The limit depends only on the opposing pool, which an open never
      // touches, so pre-trade headroom is exact — tell the user the largest
      // trade that fits instead of making them reverse-engineer the cap.
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
        )} (margin × leverage). Reduce your margin or leverage so their product fits, or wait for more ${opposite} interest to raise the cap (${direction} exposure is limited to ${PERP_OPEN_INTEREST_COVER_MULTIPLE}× the unreserved ${opposite}-side pool).`
      )
    }

    // Post-trade solvency must be >= 1, within the same relative tolerance
    // the engine's own assert uses. ADL deliberately scales winners so the
    // factor lands at EXACTLY 1, so after any ADL event the book sits on the
    // boundary within float dust — a strict `< 1` then rejects every open on
    // the winning side with "solvency 1.000 < 1" (a new position has zero
    // unrealized PnL and cannot move the factor at all).
    const solv = solvencyFactor(direction, open.state, price)
    if (solv < 1 - PERP_SOLVENCY_FACTOR_TOLERANCE)
      throw new APIError(
        400,
        `Post-trade solvency ${solv.toFixed(6)} < 1; try lower leverage or size`
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
  })
}

// -----------------------------------------------------------------------
// close
// -----------------------------------------------------------------------

export const closePosition = async (
  contractId: string,
  userId: string,
  direction: PerpDirection,
  idempotencyKey?: string,
  expectedOpenedTime?: number,
  /** See `openOrAddPosition`. */
  isApi = false
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

  return runTradeTransaction(async (pgTrans) => {
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
        if (
          request?.direction !== direction ||
          storedExpectedOpenedTime !== expectedOpenedTime
        ) {
          throw new APIError(
            409,
            'This PERP idempotency key was already used for a different close'
          )
        }
        const payout = finiteNumber(response?.payout, 'close payout')
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

    // A stale feed would let a user cherry-pick a favorable cached price after
    // watching the real market move. Opens and closes share one predicate.
    const now = Date.now()
    assertFreshOracleForTrading(contract, now)

    await assertPerpEscrowBalance(pgTrans, contractId, state.pool)

    const price = contract.oraclePrice
    // No fee on close: the taker fee is charged in full at open (see
    // openOrAddPosition), so exits pay out untouched. The opening fees the
    // position accumulated still land in this close's user-facing pnl via
    // takerFeeCostBasis.
    const result = closePositionMath(state, position, price)
    const payout = result.payout
    assertPerpStateSolvent(result.state, price)
    const userPnl = getUserFacingPnlFromPayout(
      payout,
      position.originalCostBasis,
      position.takerFeeCostBasis
    )

    const event: PerpEvent = asEvent(contract, {
      userId,
      eventType: 'close',
      direction,
      leverage: 0,
      sizeDelta: -position.size,
      costBasisDelta: -position.costBasis,
      originalCostBasisDelta: -position.originalCostBasis,
      data: {
        payout,
        pnl: userPnl,
        pricePnl: result.pnl,
        entryPrice: position.entryPrice,
        closePrice: price,
        originalCostBasis: position.originalCostBasis,
        takerFeeCostBasis: position.takerFeeCostBasis ?? 0,
        ...(isApi ? { isApi: true } : {}),
        ...(idempotencyKey
          ? {
              idempotencyKey,
              request: { direction, expectedOpenedTime },
              response: { payout, pnl: userPnl },
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
      volume: (contract.volume ?? 0) + position.originalCostBasis,
      volume24Hours: (contract.volume24Hours ?? 0) + position.originalCostBasis,
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
            reason: 'close',
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
        deletePositionsQuery(contractId, [{ userId, direction }]),
        insertPerpEventsQuery([event]),
        mergeContractDataQuery(contractId, contractPatch),
        metricsQuery,
      ].join(';\n')
    )

    return { payout, pnl: userPnl, replayed: false }
  })
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
  side: PerpDirection,
  amount: number
) => {
  if (!Number.isFinite(amount) || amount <= 0)
    throw new APIError(400, 'amount must be a finite positive number')

  return runPerpTransaction(async (pgTrans) => {
    // Rejects resolved markets and non-MANA tokens, and serializes against
    // every other engine writer on this contract.
    const { contract, state } = await loadStateForUpdate(pgTrans, contractId)

    const funder = await pgTrans.oneOrNone<{ id: string; balance: number }>(
      `select id, balance from users where id = $1 for update`,
      [funderId]
    )
    if (!funder) throw new APIError(404, `User ${funderId} not found`)
    if (!Number.isFinite(funder.balance) || funder.balance < amount)
      throw new APIError(
        403,
        `Insufficient balance: needed ${amount}, have ${funder.balance}`
      )

    await assertPerpEscrowBalance(pgTrans, contractId, state.pool)

    await runTxnOutsideBetQueue(pgTrans, {
      category: 'ADD_SUBSIDY',
      fromId: funderId,
      fromType: 'USER',
      toId: contractId,
      toType: 'CONTRACT',
      amount,
      token: 'M$',
      data: { side, reason: 'perp-pool-subsidy' },
    })

    const pool = {
      L: state.pool.L + (side === 'long' ? amount : 0),
      S: state.pool.S + (side === 'short' ? amount : 0),
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

    return { contract, poolLong: pool.L, poolShort: pool.S }
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

export const runOracleUpdate = async (
  contractId: string,
  newPrice: number,
  ts: number,
  sourceTs?: number,
  /** Fast-tick only. Omit to wait as long as it takes; see OracleUpdateBounds. */
  bounds?: OracleUpdateBounds
): Promise<OracleUpdateResult | null> => {
  return runPerpTransaction(
    async (pgTrans) => {
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
      const { contract, state } = await loadStateForUpdate(pgTrans, contractId)

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
        throw new APIError(400, `Invalid oracle transition: ${decision.reason}`)
      // Delivery can race even though state writes cannot. Once the contract
      // lock is held, an older point or exact retry must not touch price, pools,
      // positions, metrics, or event history.
      if (decision.action === 'ignore') return null

      const poolLongBefore = state.pool.L
      const poolShortBefore = state.pool.S

      const appliedTime = Date.now()
      const applied = applyOracleUpdate(
        contract,
        state,
        newPrice,
        ts,
        appliedTime
      )

      const { upserts, deletes } = diffForWrite(
        state.positions,
        applied.finalState.positions
      )

      const contractPatch = removeUndefinedProps({
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

      if (applied.adlSettled.length > 0) {
        await assertPerpEscrowBalance(pgTrans, contractId, state.pool)
      }
      await payAdlSettlements(pgTrans, contractId, newPrice, applied.adlSettled)
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
    },
    bounds?.maxAttempts,
    // Only a bounded caller can produce these, and it handles them itself.
    // Unbounded callers keep ERROR for every failure.
    bounds
      ? { isExpectedError: isOracleTickTimeout, tag: FAST_TICK_TX_TAG }
      : undefined
  )
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
