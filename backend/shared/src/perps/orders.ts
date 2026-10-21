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
  calcPerpTakerFee,
  perpMaxFeeFor,
} from 'common/perps/fees'
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
// next oracle tick and every submission need.
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
  // table alone: once before the contract lock the oracle tick needs, so
  // retries cannot queue against it, and again under the lock.
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
  return runTransactionWithRetries(async (tx) => {
    const early = await existing(tx)
    if (early) return { order: early, created: false }
    await tx
      .one(`set local lock_timeout = 3000; ${advisoryLockQuery(contractId)}`)
      .catch((error: unknown) => {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === '55P03'
        )
          throw new APIError(503, 'This market is busy; try again in a moment')
        throw error
      })
    const prior = await existing(tx)
    if (prior) return { order: prior, created: false }
    const row = await tx.oneOrNone<{ data: PerpContract; token: string }>(
      'select data,token from contracts where id=$1 for update',
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
          `maxFee must cover this market's M$${flatFee.toFixed(2)} fee`
        )
      request = { ...input, maxFee }
      const balance = Number(user.balance)
      const flip = position && position.direction !== input.direction
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
  }, 8)
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
      await tx.none(
        'update perp_orders set status=$2, execution_point=$3 where id=$1',
        [o.id, expired ? 'expired' : 'filled', point]
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
        await tx.none(
          "update perp_orders set status='rejected',error=$2,completed_time=clock_timestamp() where id=$1",
          [
            o.id,
            error instanceof APIError && error.code < 500
              ? error.message
              : 'This order could not be executed. Your reserve has been returned.',
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
  const row = await pg.oneOrNone<StoredOrder>(
    `select * from perp_orders where contract_id=$1 and user_id=$2 and ($3::text is null or id=$3) order by created_time desc,id desc limit 1`,
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
