import { randomBytes } from 'crypto'
import { omit } from 'lodash'
import { APIError } from 'common/api/utils'
import {
  BANNED_TRADING_USER_IDS,
  PERPS_SKIP_ORACLE_FRESHNESS,
} from 'common/envs/constants'
import { getPerpOracleFreshness } from 'common/perps/oracle'
import { isUserBanned, getUserBanMessage } from 'common/ban-utils'
import { UserBan } from 'common/user'
import { PerpContract } from 'common/contract'
import {
  MNX_SOURCE_CLOCK_ALLOWANCE_MS,
  PerpOrder,
  PerpOrderRequest,
  PerpOrderResult,
  isEligiblePerpTick,
  perpEligibilityCutoff,
} from 'common/perps/orders'
import { OraclePoint } from 'common/perps/oracle'
import { PerpPosition } from 'common/perps/position'
import {
  getPerpEffectiveTakerFeeBps,
  getPerpTakerFeeImpact,
  calcPerpTakerFee,
  formatPerpFeeCents,
  perpMaxFeeFor,
  perpOpenFeeQuote,
  perpOwnContributionInputs,
} from 'common/perps/fees'
import { getPerpBackingPool } from 'common/perps/amm'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { runTxnOutsideBetQueue } from 'shared/txn/run-txn'
import { log } from 'shared/utils'
import { advisoryLockQuery, rowToPosition } from './queries'
import { buildPerpUserContractMetricsQuery } from './user-contract-metrics'

export type StoredOrder = {
  id: string
  contract_id: string
  user_id: string
  idempotency_key: string
  fingerprint: string
  request: PerpOrderRequest
  is_api: boolean
  expected_opened_time: string | null
  reserved_mana: string | number
  created_time: string
  expires_time: string
  status: PerpOrder['status']
  result: PerpOrderResult | null
  error: string | null
}
export const publicPerpOrder = (o: StoredOrder): PerpOrder => ({
  id: o.id,
  contractId: o.contract_id,
  status: o.status,
  createdTime: new Date(o.created_time).getTime(),
  expiresTime: new Date(o.expires_time).getTime(),
  reservedMana: o.status === 'pending' ? Number(o.reserved_mana) : 0,
  request: o.request,
  result: o.result,
  error: o.error,
})

const escrowId = 'PERP_ORDER_ESCROW'
// Orders settled per transaction. The rest wait at the same price for
// follow-up transactions, so a burst cannot hold the contract lock that the
// next oracle tick needs.
export const PERP_ORDERS_PER_SETTLEMENT = 10
// Numeric sanity floor: margins far below a cent underflow the entry-price math.
const PERP_MIN_ORDER_MARGIN = 0.01

// Lock or serialization contention says nothing about the order: it stays
// pending at this price for a fresh transaction, instead of rolling back the
// risk pass it shares a transaction with.
const RETRYABLE_DB_ERRORS = ['40001', '40P01', '55P03', '57014']
const isRetryableDbError = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  RETRYABLE_DB_ERRORS.includes(String(error.code))

const refreshMetrics = async (
  tx: SupabaseTransaction,
  contract: PerpContract,
  userId: string
) => {
  const rows = await tx.any(
    'select * from contract_perp_positions where contract_id=$1 and user_id=$2',
    [contract.id, userId]
  )
  await tx.multi(
    await buildPerpUserContractMetricsQuery(tx, {
      contract,
      userIds: [userId],
      finalPositions: rows.map(rowToPosition),
    })
  )
}
// Metrics are derived and rebuilt by the next trade or funding run, so failing
// to refresh them must not undo an order's money movement.
const refreshMetricsSafely = async (
  tx: SupabaseTransaction,
  contract: PerpContract,
  userId: string
) => {
  await tx.none('savepoint perp_order_metrics')
  try {
    await refreshMetrics(tx, contract, userId)
    await tx.none('release savepoint perp_order_metrics')
  } catch (error) {
    await tx.none('rollback to savepoint perp_order_metrics')
    await tx.none('release savepoint perp_order_metrics')
    log.error(
      `[perp-orders] metrics refresh failed for ${userId} on ${contract.id}: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
}

export const enqueuePerpOrder = async (
  contractId: string,
  userId: string,
  input:
    | (Omit<Extract<PerpOrderRequest, { kind: 'trade' }>, 'maxFee'> & {
        maxFee?: number
      })
    | Extract<PerpOrderRequest, { kind: 'close' }>,
  idempotencyKey: string,
  isApi: boolean,
  expectedOpenedTime?: number,
  expectedSize?: number
): Promise<{ order: PerpOrder; created: boolean }> => {
  // maxFee is a consent bound clients recompute from live pools on retry, so,
  // as in the immediate engine, it is not part of the idempotency fingerprint.
  const fingerprint = JSON.stringify({
    input: omit(input, 'maxFee'),
    expectedOpenedTime,
    expectedSize,
  })
  // Replays and a second order of the same kind are answered from the order
  // table alone: once up front, and again under the user's row lock, which
  // serializes one user's submissions (both unique indexes include the user).
  const existing = async (tx: SupabaseTransaction) => {
    const prior = await tx.oneOrNone<StoredOrder>(
      'select * from perp_orders where contract_id=$1 and user_id=$2 and idempotency_key=$3',
      [contractId, userId, idempotencyKey]
    )
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        throw new APIError(409, 'This idempotency key belongs to another order')
      return publicPerpOrder(prior)
    }
    const pending = await tx.oneOrNone(
      "select id from perp_orders where contract_id=$1 and user_id=$2 and status='pending' and request->>'kind'=$3",
      [contractId, userId, input.kind]
    )
    if (pending)
      throw new APIError(
        409,
        input.kind === 'close'
          ? 'You already have a close waiting for the next price'
          : 'You already have an order waiting for the next price'
      )
    return null
  }
  const submit = async (tx: SupabaseTransaction) => {
    const early = await existing(tx)
    if (early) return { order: early, created: false }
    // Bounds the user-row wait below (mapped to a 503 by the caller).
    await tx.one("select set_config('lock_timeout', '3000', true)")
    // Read, not locked: the market's state is re-checked when the order
    // executes, and resolution refunds whatever is still waiting.
    const row = await tx.oneOrNone<{ data: PerpContract; token: string }>(
      'select data,token from contracts where id=$1',
      [contractId]
    )
    if (!row || row.data.mechanism !== 'perp' || row.token !== 'MANA')
      throw new APIError(404, 'Perpetual market not found')
    const contract = { ...row.data, token: row.token } as PerpContract
    // A close time stops new exposure only: holders could always exit.
    if (
      contract.isResolved ||
      contract.solvencyHaltTime != null ||
      (input.kind === 'trade' &&
        contract.closeTime &&
        Date.now() >= contract.closeTime)
    )
      throw new APIError(400, 'Trading is unavailable on this market')
    const system = await tx.oneOrNone<{ status: boolean }>(
      "select status from system_trading_status where token='MANA'"
    )
    if (!system?.status)
      throw new APIError(403, 'Trading with mana is currently disabled')
    if (
      !PERPS_SKIP_ORACLE_FRESHNESS &&
      getPerpOracleFreshness(contract, Date.now()).status !== 'fresh'
    )
      throw new APIError(
        400,
        'The oracle is unavailable; try again after a fresh update'
      )
    if (BANNED_TRADING_USER_IDS.includes(userId))
      throw new APIError(403, 'Trading is disabled for this account')
    const bans = await tx.manyOrNone<UserBan>(
      'select * from user_bans where user_id=$1 and ended_at is null and (end_time is null or end_time>now())',
      [userId]
    )
    if (isUserBanned(bans, 'trading'))
      throw new APIError(
        403,
        getUserBanMessage(bans, 'trading') ??
          'Trading is disabled for this account'
      )
    const user = await tx.oneOrNone<{
      balance: number | string
      data: { userDeleted?: boolean } | null
    }>('select balance,data from users where id=$1 for update', [userId])
    if (!user || !Number.isFinite(Number(user.balance)))
      throw new APIError(400, 'Account balance unavailable')
    // This user's earlier submissions have now committed (or failed), so a
    // replay or a second order of the same kind is answered exactly.
    const prior = await existing(tx)
    if (prior) return { order: prior, created: false }
    if (user.data?.userDeleted)
      throw new APIError(403, 'This account is deleted')
    if (
      input.kind === 'trade' &&
      contract.creatorBannedFromBetting &&
      userId === contract.creatorId
    )
      throw new APIError(
        403,
        'You have blocked yourself from trading on this market'
      )
    const positionRows = await tx.any(
      'select * from contract_perp_positions where contract_id=$1 and user_id=$2 and size>0',
      [contractId, userId]
    )
    const position: PerpPosition | undefined =
      positionRows.map(rowToPosition)[0]
    if (
      expectedOpenedTime !== undefined &&
      position?.openedTime !== expectedOpenedTime
    )
      throw new APIError(
        409,
        'Your position changed; refresh before submitting'
      )
    // Only a partial close is a fraction OF a previewed size.
    if (
      input.kind === 'close' &&
      input.fraction < 1 &&
      expectedSize !== undefined &&
      position &&
      Math.abs(position.size - expectedSize) > Math.max(1, position.size) * 1e-9
    )
      throw new APIError(
        409,
        'Your position size changed; refresh before submitting'
      )
    let request: PerpOrderRequest
    let reserve = 0
    if (input.kind === 'trade') {
      if (
        !Number.isFinite(input.mana) ||
        input.mana < PERP_MIN_ORDER_MARGIN ||
        !Number.isFinite(input.leverage) ||
        input.leverage < 1 ||
        input.leverage > contract.maxLeverage
      )
        throw new APIError(400, 'Invalid margin or leverage')
      if ((contract.takerFeeImpact ?? 0) > 0 && input.maxFee === undefined)
        throw new APIError(400, 'Pass maxFee for this market')
      const notional = input.mana * input.leverage
      const flatFee = calcPerpTakerFee(
        notional,
        getPerpEffectiveTakerFeeBps(contract, isApi)
      )
      // Execution prices the fee along a different float path, so a defaulted
      // bound carries the same slippage room the web client sends.
      const maxFee = input.maxFee ?? perpMaxFeeFor(flatFee, notional)
      if (
        !Number.isFinite(maxFee) ||
        maxFee < 0 ||
        !Number.isFinite(input.mana + maxFee)
      )
        throw new APIError(400, 'Invalid fee allowance')
      // An allowance below the configured fee can never fill.
      if (maxFee < flatFee)
        throw new APIError(
          400,
          `maxFee must cover this market's M$${formatPerpFeeCents(
            flatFee,
            'up'
          )} fee`
        )
      const flip = position && position.direction !== input.direction
      // With a size fee, the configured fee is only a floor: an allowance
      // below the fee at the current pools would be accepted, earn the
      // submission's streak and bonuses, and then be refused at execution.
      // Priced as the engine prices it, at the current mark. A flip's new leg
      // is priced after its close, against a shallower pool, so it keeps the
      // configured floor.
      const impact = getPerpTakerFeeImpact(contract)
      if (impact > 0 && !flip) {
        const quote = perpOpenFeeQuote({
          grossPoolDepth: getPerpBackingPool(
            contract.poolLong,
            contract.poolShort
          ),
          ...perpOwnContributionInputs(position, contract.oraclePrice),
          addedNotional: notional,
          baseBps: getPerpEffectiveTakerFeeBps(contract, isApi),
          impact,
        })
        if (quote.depthExhausted)
          throw new APIError(
            400,
            'This market’s backing is exhausted relative to your position — the size fee cannot be priced. Close or reduce instead of adding.'
          )
        if (maxFee < quote.fee)
          throw new APIError(
            400,
            `maxFee must be at least M$${formatPerpFeeCents(
              quote.fee,
              'up'
            )}, this order's fee at the current pools`
          )
      }
      request = { ...input, maxFee }
      const balance = Number(user.balance)
      // An open or add must afford its margin and configured fee now, as the
      // immediate engine required. A flip may be funded by its own payout,
      // but not from below zero: its fill would then turn on later deposits.
      if (flip ? balance < 0 : balance < input.mana + flatFee)
        throw new APIError(
          403,
          'Insufficient balance to reserve margin and fees'
        )
      // The reserve is debited from the exact numeric balance, which the
      // parsed float can exceed by half a step: stay a step below it, and
      // reserve the fee allowance only as far as the balance reaches.
      reserve = Math.min(
        Math.max(0, balance - Math.abs(balance) * Number.EPSILON),
        input.mana + maxFee
      )
    } else {
      if (!position || position.direction !== input.direction)
        throw new APIError(404, 'No matching position to close')
      if (
        !Number.isFinite(input.fraction) ||
        input.fraction < 0.01 ||
        input.fraction > 1
      )
        throw new APIError(400, 'Invalid close fraction')
      request = input
    }
    // Keys used by the immediate engine live on events; each arm matches one
    // of the two partial unique idempotency indexes.
    const legacy = await tx.oneOrNone(
      `select id from contract_perp_events where contract_id=$1 and user_id=$2 and event_type in ('open','add') and data ? 'idempotencyKey' and data->>'idempotencyKey'=$3
      union all
      select id from contract_perp_events where contract_id=$1 and user_id=$2 and event_type='close' and data ? 'idempotencyKey' and data->>'idempotencyKey'=$3
      limit 1`,
      [contractId, userId, idempotencyKey]
    )
    if (legacy)
      throw new APIError(
        409,
        'This key was used by an earlier trade; use a new key for a new order'
      )
    // A soft cap: concurrent submissions can each see a count below it.
    const waiting = await tx.one<{ count: string }>(
      "select count(*) from perp_orders where contract_id=$1 and status='pending'",
      [contractId]
    )
    if (input.kind === 'trade' && Number(waiting.count) >= 100)
      throw new APIError(
        429,
        'This market has too many pending orders; try again after the next update'
      )
    const id = randomBytes(16).toString('hex')
    // Slow daily feeds need enough time to produce their next observation.
    const ttl = Math.max(10 * 60_000, 2 * contract.maxOraclePriceAgeMs)
    const order = await tx.one<StoredOrder>(
      `insert into perp_orders(id,contract_id,user_id,idempotency_key,fingerprint,request,is_api,expected_opened_time,reserved_mana,expires_time)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,clock_timestamp()+($10*interval '1 millisecond')) returning *`,
      [
        id,
        contractId,
        userId,
        idempotencyKey,
        fingerprint,
        request,
        isApi,
        position?.openedTime ?? null,
        reserve,
        ttl,
      ]
    )
    if (reserve > 0)
      await runTxnOutsideBetQueue(
        tx,
        {
          category: 'PERP_ORDER_RESERVE',
          fromType: 'USER',
          fromId: userId,
          toType: 'BANK',
          toId: escrowId,
          token: 'M$',
          amount: reserve,
          data: { orderId: id, contractId },
        },
        true
      )
    await refreshMetrics(tx, contract, userId)
    return { order: publicPerpOrder(order), created: true }
  }
  // READ COMMITTED with no market lock, as add-liquidity does for the same
  // reason. Under SERIALIZABLE behind the market lock, each snapshot predated
  // its wait, so a burst of submissions to one market aborted and requeued
  // itself (40001) while holding connections, and starved the oracle tick
  // queued behind it (dev QA, 60 at once: 24 × 500, 2 × 503 and 8 s without
  // a price). Submissions now run side by side and never block the tick.
  // Every read above is locked (the user row), enforced by a unique index
  // (replays, one pending order per kind) or re-checked when the order
  // executes (the market's state, the bound position).
  try {
    return await runTransactionWithRetries(submit, 3, {
      mode: 'default',
      isExpectedError: (error) => error instanceof APIError,
    })
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : undefined
    if (code === '55P03')
      throw new APIError(503, 'Your account is busy; try again in a moment')
    // A backstop: the user row lock already serializes the submissions these
    // indexes compare, so this means a concurrent writer outside that lock.
    if (code === '23505') {
      const raced = await runTransactionWithRetries((tx) => existing(tx), 1, {
        mode: 'default',
        isExpectedError: (e) => e instanceof APIError,
      })
      if (raced) return { order: raced, created: false }
      throw new APIError(
        409,
        'Another of your orders changed while this one was placed; try again'
      )
    }
    throw error
  }
}

type Execute = (
  tx: SupabaseTransaction,
  order: StoredOrder
) => Promise<PerpOrderResult>
const release = async (tx: SupabaseTransaction, o: StoredOrder) => {
  const amount = Number(o.reserved_mana)
  if (!Number.isFinite(amount) || amount < 0)
    throw new Error('Invalid order reserve')
  if (amount > 0)
    await runTxnOutsideBetQueue(
      tx,
      {
        category: 'PERP_ORDER_RELEASE',
        fromType: 'BANK',
        fromId: escrowId,
        toType: 'USER',
        toId: o.user_id,
        token: 'M$',
        amount,
        data: { orderId: o.id, contractId: o.contract_id },
      },
      true
    )
}

export const hasPendingPerpOrders = async (
  pg: SupabaseDirectClient,
  contractId: string
) =>
  !!(await pg.oneOrNone(
    "select 1 from perp_orders where contract_id=$1 and status='pending' limit 1",
    [contractId]
  ))

// Whether a waiting order is owed a fill at `point`, by settlement's cutoff.
export const hasEligiblePendingPerpOrder = async (
  pg: SupabaseDirectClient,
  contract: Pick<PerpContract, 'id' | 'oracleFeedId'>,
  point: OraclePoint
) => {
  const cutoff = perpEligibilityCutoff(contract.oracleFeedId, point)
  if (cutoff == null) return false
  return !!(await pg.oneOrNone(
    "select 1 from perp_orders where contract_id=$1 and status='pending' and created_time < $2::timestamptz limit 1",
    [contract.id, new Date(cutoff).toISOString()]
  ))
}

// The earliest persisted observation strictly between two marks that a
// waiting order is eligible for: a point the mark skipped, because another
// publisher applied a newer one first or its apply failed after it was
// persisted. Settlement at a later point would reject that order as having
// missed it; the predicate mirrors that check (and perpEligibilityCutoff).
export const findSkippedPerpObservation = async (
  pg: SupabaseDirectClient,
  contract: Pick<PerpContract, 'id' | 'oracleFeedId'>,
  afterTs: number,
  beforeTs: number
): Promise<OraclePoint | null> => {
  const row = await pg.oneOrNone<{
    ts: string
    price: number | string
    source_ts: string | null
  }>(
    `select p.ts,p.price,p.source_ts from oracle_prices p
    where p.feed_id=$1 and p.ts>$2::timestamptz and p.ts<$3::timestamptz
      and ($5::boolean=false or (p.source_ts is not null and p.source_ts<=p.ts))
      and exists (select 1 from perp_orders o
        where o.contract_id=$4 and o.status='pending' and o.created_time<p.ts
          and ($5::boolean=false or o.created_time<p.source_ts-$6::float8*interval '1 millisecond'))
    order by p.ts limit 1`,
    [
      contract.oracleFeedId,
      new Date(afterTs).toISOString(),
      new Date(beforeTs).toISOString(),
      contract.id,
      contract.oracleFeedId.startsWith('mnx-'),
      MNX_SOURCE_CLOCK_ALLOWANCE_MS,
    ]
  )
  if (!row) return null
  return {
    price: Number(row.price),
    ts: new Date(row.ts).getTime(),
    ...(row.source_ts == null
      ? {}
      : { sourceTs: new Date(row.source_ts).getTime() }),
  }
}

export type PerpOrderSettlement = { deferred: string[]; remaining: number }

// Caller holds the contract lock. Fills commit with the risk transition at the
// same price. An order this transaction cannot finish (`deferred`: contention;
// `remaining`: past `limit`, counted to the first) stays pending for follow-up
// transactions at that price; a later tick that lands first rejects what is
// left as having missed its window. `skip` lets a caller stop retrying a
// contended order so the orders behind it get their turn.
export const settlePendingPerpOrders = async (
  tx: SupabaseTransaction,
  contract: PerpContract,
  point: OraclePoint | null,
  execute: Execute,
  options: {
    limit?: number
    drainReason?: string
    skip?: ReadonlySet<string>
  } = {}
): Promise<PerpOrderSettlement> => {
  const { limit = PERP_ORDERS_PER_SETTLEMENT, drainReason, skip } = options
  const settleAll = drainReason !== undefined || !!contract.isResolved
  const cutoff = point
    ? perpEligibilityCutoff(contract.oracleFeedId, point)
    : null
  // Lock only what this pass can act on: orders expired (on the database clock
  // that set their expiry) or eligible at this price, in settlement order,
  // plus one to tell whether more remain. Waiting orders stay unlocked.
  const orders = await tx.manyOrNone<StoredOrder & { is_expired: boolean }>(
    `select *, expires_time <= statement_timestamp() as is_expired from perp_orders
    where contract_id=$1 and status='pending' and not (id = any($2::text[]))
      and ($3::boolean or expires_time <= statement_timestamp() or created_time < $4::timestamptz)
    order by (request->>'kind'='close') desc,created_time,id
    limit $5::bigint for update`,
    [
      contract.id,
      [...(skip ?? [])],
      settleAll,
      cutoff == null ? null : new Date(cutoff).toISOString(),
      Number.isFinite(limit) ? limit + 1 : null,
    ]
  )
  // A busy owner row is that order's contention, not the market's: bound the
  // wait so no caller sits on the contract lock behind one user.
  const { lock_timeout: callerLockTimeout } = await tx.one<{
    lock_timeout: string
  }>("select current_setting('lock_timeout') as lock_timeout")
  await tx.one("select set_config('lock_timeout', '250', true)")
  const deferred: string[] = []
  for (const o of orders.slice(0, limit)) {
    // Expiry is still checked as each order is reached, as before.
    const expired =
      settleAll ||
      o.is_expired ||
      Date.now() >= new Date(o.expires_time).getTime()
    if (
      !expired &&
      (!point ||
        !isEligiblePerpTick(
          contract.oracleFeedId,
          new Date(o.created_time).getTime(),
          point
        ))
    )
      continue
    await tx.none('savepoint perp_order')
    try {
      // An expired order never executed: the mark it expired under can
      // predate the order itself, so it records no execution point.
      await tx.none(
        'update perp_orders set status=$2, execution_point=$3 where id=$1',
        [o.id, expired ? 'expired' : 'filled', expired ? null : point]
      )
      await release(tx, o)
      if (!expired) {
        // A failed/skipped tick must not silently execute at a later price.
        // Mirrors isEligiblePerpTick, so a row it skipped is not "missed".
        const missed = await tx.oneOrNone(
          `select ts from oracle_prices where feed_id=$1 and ts> $2 and ts< $3
          and ($4::boolean=false or (source_ts>$2::timestamptz+$5::float8*interval '1 millisecond' and source_ts<=ts)) order by ts limit 1`,
          [
            contract.oracleFeedId,
            o.created_time,
            new Date(point!.ts).toISOString(),
            contract.oracleFeedId.startsWith('mnx-'),
            MNX_SOURCE_CLOCK_ALLOWANCE_MS,
          ]
        )
        if (missed)
          throw new APIError(
            409,
            'The next-price execution window was missed. Your reserve has been returned; submit a new order to try again.'
          )
        const bound = await tx.oneOrNone<{ opened_time: string }>(
          'select opened_time from contract_perp_positions where contract_id=$1 and user_id=$2 and size>0',
          [o.contract_id, o.user_id]
        )
        if (
          o.expected_opened_time != null &&
          (!bound ||
            new Date(bound.opened_time).getTime() !==
              Number(o.expected_opened_time))
        )
          throw new APIError(
            409,
            'The original position was closed or liquidated before execution'
          )
        if (o.expected_opened_time == null && bound)
          throw new APIError(409, 'Your position changed before execution')
        const result = await execute(tx, o)
        await tx.none(
          'update perp_orders set result=$2,completed_time=clock_timestamp() where id=$1',
          [o.id, result]
        )
      } else {
        await tx.none(
          'update perp_orders set error=$2,completed_time=clock_timestamp() where id=$1',
          [
            o.id,
            drainReason ??
              (contract.isResolved
                ? 'Market settled before this order filled'
                : 'No eligible price arrived before expiry'),
          ]
        )
        await refreshMetricsSafely(tx, contract, o.user_id)
      }
      await tx.none('release savepoint perp_order')
    } catch (error) {
      await tx.none('rollback to savepoint perp_order')
      if (isRetryableDbError(error)) {
        deferred.push(o.id)
        await tx.none('release savepoint perp_order')
        continue
      }
      // Anything else is this order's own failure, including an invariant the
      // engine refused to cross: reject and refund it. Rethrowing would roll
      // back the price, liquidations and ADL for the whole market (LIVENESS).
      const userFacing = error instanceof APIError && error.code < 500
      if (!userFacing)
        log.error(
          `[perp-orders] order ${o.id} on ${
            contract.id
          } rejected after an execution fault: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      try {
        // The rejecting price is kept, so a rejection says which tick made it.
        await tx.none(
          "update perp_orders set status='rejected',error=$2,execution_point=$3,completed_time=clock_timestamp() where id=$1",
          [
            o.id,
            error instanceof APIError && error.code < 500
              ? error.message
              : 'This order could not be executed. Your reserve has been returned.',
            expired ? null : point,
          ]
        )
        await release(tx, o)
        await refreshMetricsSafely(tx, contract, o.user_id)
        await tx.none('release savepoint perp_order')
      } catch (refundError) {
        await tx.none('rollback to savepoint perp_order')
        await tx.none('release savepoint perp_order')
        if (!isRetryableDbError(refundError)) throw refundError
        deferred.push(o.id)
      }
    }
  }
  await tx.one("select set_config('lock_timeout', $1, true)", [
    callerLockTimeout,
  ])
  return { deferred, remaining: Math.max(0, orders.length - limit) }
}

export const readPerpOrder = async (
  contractId: string,
  userId: string,
  id?: string
) => {
  const pg = createSupabaseDirectClient()
  // Without an id, a waiting order comes first: a trade and a close can both
  // be pending, and a newer close that completes first must not hide the
  // older trade (and its reserve) from the page recovering it.
  const row = await pg.oneOrNone<StoredOrder>(
    `select * from perp_orders where contract_id=$1 and user_id=$2 and ($3::text is null or id=$3) order by (status='pending') desc,created_time desc,id desc limit 1`,
    [contractId, userId, id ?? null]
  )
  return row ? publicPerpOrder(row) : null
}

// Operator drain for incidents and code rollbacks: refunds every pending order
// on the contract without executing it. PERP_TRADING_MODE only gates new
// submissions, so this is how queued orders are stopped.
export const refundPendingPerpOrders = (contractId: string, reason: string) =>
  runTransactionWithRetries(async (tx) => {
    await tx.one(advisoryLockQuery(contractId))
    const row = await tx.one<{ data: PerpContract }>(
      'select data from contracts where id=$1 for update',
      [contractId]
    )
    return settlePendingPerpOrders(
      tx,
      row.data,
      null,
      async () => {
        throw new Error('A drain cannot execute an order')
      },
      { limit: Infinity, drainReason: reason }
    )
  }, 8)
