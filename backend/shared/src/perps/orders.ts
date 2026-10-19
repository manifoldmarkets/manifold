import { randomBytes } from 'crypto'
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
  PerpOrder,
  PerpOrderRequest,
  PerpOrderResult,
  isEligiblePerpTick,
} from 'common/perps/orders'
import { OraclePoint } from 'common/perps/oracle'
import { PerpPosition } from 'common/perps/position'
import {
  getPerpEffectiveTakerFeeBps,
  calcPerpTakerFee,
} from 'common/perps/fees'
import {
  createSupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { runTxnOutsideBetQueue } from 'shared/txn/run-txn'
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
const refreshMetrics = async (
  tx: SupabaseTransaction,
  contract: PerpContract,
  userId: string
) => {
  const rows = await tx.any(
    'select * from contract_perp_positions where contract_id=$1',
    [contract.id]
  )
  await tx.multi(
    await buildPerpUserContractMetricsQuery(tx, {
      contract,
      userIds: [userId],
      finalPositions: rows.map(rowToPosition),
    })
  )
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
) =>
  runTransactionWithRetries(async (tx) => {
    await tx.one(advisoryLockQuery(contractId))
    const fingerprint = JSON.stringify({
      input,
      expectedOpenedTime,
      expectedSize,
    })
    const prior = await tx.oneOrNone<StoredOrder>(
      'select * from perp_orders where contract_id=$1 and user_id=$2 and idempotency_key=$3',
      [contractId, userId, idempotencyKey]
    )
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        throw new APIError(409, 'This idempotency key belongs to another order')
      return publicPerpOrder(prior)
    }
    const row = await tx.oneOrNone<{ data: PerpContract; token: string }>(
      'select data,token from contracts where id=$1 for update',
      [contractId]
    )
    if (!row || row.data.mechanism !== 'perp' || row.token !== 'MANA')
      throw new APIError(404, 'Perpetual market not found')
    const contract = { ...row.data, token: row.token } as PerpContract
    if (
      contract.isResolved ||
      contract.solvencyHaltTime != null ||
      (contract.closeTime && Date.now() >= contract.closeTime)
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
    const pending = await tx.oneOrNone(
      "select id from perp_orders where contract_id=$1 and user_id=$2 and status='pending'",
      [contractId, userId]
    )
    if (pending)
      throw new APIError(
        409,
        'You already have an order waiting for the next price'
      )
    const user = await tx.oneOrNone<{
      balance: number | string
      data: { userDeleted?: boolean } | null
    }>('select balance,data from users where id=$1 for update', [userId])
    if (!user || !Number.isFinite(Number(user.balance)))
      throw new APIError(400, 'Account balance unavailable')
    if (user.data?.userDeleted)
      throw new APIError(403, 'This account is deleted')
    if (contract.creatorBannedFromBetting && userId === contract.creatorId)
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
    if (
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
        input.mana <= 0 ||
        !Number.isFinite(input.leverage) ||
        input.leverage < 1 ||
        input.leverage > contract.maxLeverage
      )
        throw new APIError(400, 'Invalid margin or leverage')
      if ((contract.takerFeeImpact ?? 0) > 0 && input.maxFee === undefined)
        throw new APIError(400, 'Pass maxFee for this market')
      const maxFee =
        input.maxFee ??
        calcPerpTakerFee(
          input.mana * input.leverage,
          getPerpEffectiveTakerFeeBps(contract, isApi)
        )
      if (
        !Number.isFinite(maxFee) ||
        maxFee < 0 ||
        !Number.isFinite(input.mana + maxFee)
      )
        throw new APIError(400, 'Invalid fee allowance')
      request = { ...input, maxFee }
      const flip = position && position.direction !== input.direction
      reserve = flip
        ? Math.min(Number(user.balance), input.mana + maxFee)
        : input.mana + maxFee
      if (reserve > Number(user.balance) || reserve < 0)
        throw new APIError(
          403,
          'Insufficient balance to reserve margin and fees'
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
    const legacy = await tx.oneOrNone(
      "select id from contract_perp_events where contract_id=$1 and user_id=$2 and data->>'idempotencyKey'=$3 limit 1",
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
    return publicPerpOrder(order)
  }, 8)

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

// Caller holds the contract lock. Successful risk transitions and these fills
// commit together, so later ticks cannot overtake voluntary execution.
export const settlePendingPerpOrders = async (
  tx: SupabaseTransaction,
  contract: PerpContract,
  point: OraclePoint | null,
  execute: Execute
) => {
  const orders = await tx.manyOrNone<StoredOrder>(
    "select * from perp_orders where contract_id=$1 and status='pending' order by (request->>'kind'='close') desc,created_time,id for update",
    [contract.id]
  )
  for (const o of orders) {
    const expired =
      contract.isResolved || Date.now() >= new Date(o.expires_time).getTime()
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
        const missed = await tx.oneOrNone(
          `select ts from oracle_prices where feed_id=$1 and ts> $2 and ts< $3
          and ($4::boolean=false or source_ts>$2) order by ts limit 1`,
          [
            contract.oracleFeedId,
            o.created_time,
            new Date(point!.ts).toISOString(),
            contract.oracleFeedId.startsWith('mnx-'),
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
            contract.isResolved
              ? 'Market settled before this order filled'
              : 'No eligible price arrived before expiry',
          ]
        )
      }
      await tx.none('release savepoint perp_order')
    } catch (error) {
      await tx.none('rollback to savepoint perp_order')
      // Database/invariant faults retry the whole tick; do not turn a failed
      // transaction into a trader-selectable cancellation at a known price.
      if (!(error instanceof APIError) || error.code >= 500) throw error
      await tx.none(
        "update perp_orders set status='rejected',error=$2,completed_time=clock_timestamp() where id=$1",
        [o.id, error.message]
      )
      await release(tx, o)
      await tx.none('release savepoint perp_order')
    }
    const current = await tx.one<{ data: PerpContract }>(
      'select data from contracts where id=$1',
      [contract.id]
    )
    await refreshMetrics(tx, current.data, o.user_id)
  }
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

// Also runs independently of provider health, so a dead feed cannot trap cash.
export const expirePerpOrders = async () => {
  const pg = createSupabaseDirectClient()
  const contracts = await pg.manyOrNone<{ contract_id: string }>(
    "select distinct contract_id from perp_orders where status='pending' and expires_time<=clock_timestamp() limit 100"
  )
  for (const { contract_id } of contracts)
    await runTransactionWithRetries(async (tx) => {
      await tx.one(advisoryLockQuery(contract_id))
      const row = await tx.one<{ data: PerpContract }>(
        'select data from contracts where id=$1 for update',
        [contract_id]
      )
      await settlePendingPerpOrders(tx, row.data, null, async () => {
        throw new Error('An expiry cannot execute a trade')
      })
    })
}
