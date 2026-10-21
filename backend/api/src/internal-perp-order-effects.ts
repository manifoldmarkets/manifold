import { timingSafeEqual } from 'node:crypto'
import { canReceiveBonuses } from 'common/user'
import { PARTNER_USER_IDS } from 'common/envs/constants'
import { getUniqueBettorBonusAmount } from 'common/economy'
import { UniqueBettorBonusTxn } from 'common/txn'
import { PerpContract } from 'common/contract'
import { HOUR_MS } from 'common/util/time'
import { PerpOrderRequest, PerpOrderResult } from 'common/perps/orders'
import { createPerpOrderFailedNotification } from 'shared/notifications/perps'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import { broadcastUserUpdates, UserUpdate } from 'shared/supabase/users'
import { runTxnOutsideBetQueue } from 'shared/txn/run-txn'
import { getUser, log } from 'shared/utils'
import { APIHandler, APIError } from './helpers/endpoint'

type CompletedOrder = {
  id: string
  user_id: string
  contract_id: string
  status: 'filled' | 'rejected' | 'expired'
  request: PerpOrderRequest
  result: PerpOrderResult | null
  error: string | null
  completed_time: string
}

// Runs in the API writer, which hosts the websockets: fills and refunds happen
// in scheduler-perps, whose own broadcasts reach no browser.
export const internalPerpOrderEffects: APIHandler<
  'internal-perp-order-effects'
> = async (body) => {
  const expected = process.env.API_SECRET
  if (!expected) throw new APIError(500, 'API_SECRET is not configured')
  const a = Buffer.from(body.apiSecret),
    b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b))
    throw new APIError(403, 'Invalid API secret')
  const pg = createSupabaseDirectClient()
  let processed = 0
  for (const id of body.orderIds) {
    // One order's failure must not stop the rest of the batch.
    const o = await pg
      .tx(async (tx) => {
        const order = await tx.oneOrNone<CompletedOrder>(
          "select * from perp_orders where id=$1 and status in ('filled','rejected','expired') and participation_applied_at is null for update skip locked",
          [id]
        )
        if (!order) return null
        // Before the order is marked handled, with an order-derived id, so a
        // crash or failed insert is retried by the next delivery without a
        // duplicate. After an hour of failures, give up rather than retry.
        if (
          order.status !== 'filled' &&
          !(await notifyFailedOrder(pg, order)) &&
          Date.now() - new Date(order.completed_time).getTime() < HOUR_MS
        )
          return null
        // Best-effort, as when trades ran inline: a failing bonus must not
        // block this order's other effects or any later order in the queue.
        if (
          order.status === 'filled' &&
          order.result?.kind === 'trade' &&
          order.result.isNewUniqueBettor
        ) {
          await tx.none('savepoint perp_order_effect')
          try {
            await payUniqueBettorBonus(tx, order.contract_id, order.user_id)
            await tx.none('release savepoint perp_order_effect')
          } catch (err) {
            await tx.none('rollback to savepoint perp_order_effect')
            await tx.none('release savepoint perp_order_effect')
            log('perp unique bettor bonus failed (non-fatal):', err)
          }
        }
        await tx.none(
          'update perp_orders set participation_applied_at=clock_timestamp() where id=$1',
          [id]
        )
        processed++
        return order
      })
      .catch((err) => {
        log('perp order effects failed; the next delivery retries:', err)
        return null
      })
    // Cosmetic: the next broadcast or a refocus corrects a missed one.
    if (o) await broadcastBalance(pg, o.user_id)
  }
  return { processed }
}

const broadcastBalance = async (pg: SupabaseDirectClient, userId: string) => {
  try {
    const row = await pg.oneOrNone<UserUpdate>(
      'select id, balance, cash_balance, spice_balance, total_deposits, total_cash_deposits from users where id=$1',
      [userId]
    )
    if (row) broadcastUserUpdates([row])
  } catch (err) {
    log('perp order balance broadcast failed (non-fatal):', err)
  }
}

// The trader may have left the page; tell them the order is gone.
const notifyFailedOrder = async (
  pg: SupabaseDirectClient,
  o: CompletedOrder
) => {
  try {
    const row = await pg.oneOrNone<{ data: PerpContract }>(
      'select data from contracts where id=$1',
      [o.contract_id]
    )
    if (row)
      await createPerpOrderFailedNotification(pg, row.data, o.user_id, {
        orderId: o.id,
        request: o.request,
        error: o.error,
      })
    return true
  } catch (err) {
    log('perp failed-order notification failed; will retry:', err)
    return false
  }
}

const payUniqueBettorBonus = async (
  tx: SupabaseTransaction,
  contractId: string,
  bettorId: string
) => {
  const pg = tx
  const contractRow = await pg.oneOrNone<{ data: PerpContract }>(
    `select data from contracts where id = $1 and data->>'mechanism' = 'perp'`,
    [contractId]
  )
  if (!contractRow) return
  const contract = contractRow.data
  if (contract.creatorId === bettorId) return

  const [bettor, creator] = await Promise.all([
    getUser(bettorId),
    getUser(contract.creatorId),
  ])
  if (!bettor || !creator) return
  if (bettor.isBot) return
  if (!canReceiveBonuses(bettor) || !canReceiveBonuses(creator)) return
  if (contract.visibility === 'unlisted') return

  const isPartner = PARTNER_USER_IDS.includes(contract.creatorId)
  // Perps have no answers, and totalLiquidity isn't tracked directly — use the
  // sum of pool sizes as a proxy for bonus tier.
  const liquidityProxy = contract.poolLong + contract.poolShort
  const bonus = getUniqueBettorBonusAmount(liquidityProxy, 0)

  const bonusTxn: Omit<UniqueBettorBonusTxn, 'id' | 'createdTime'> = {
    category: 'UNIQUE_BETTOR_BONUS',
    fromType: 'BANK',
    fromId: 'BANK',
    toId: contract.creatorId,
    toType: 'USER',
    amount: bonus,
    token: 'M$',
    data: {
      contractId,
      uniqueNewBettorId: bettorId,
      isPartner,
    },
  }
  await runTxnOutsideBetQueue(tx, bonusTxn)
}
