import { timingSafeEqual } from 'node:crypto'
import { canReceiveBonuses } from 'common/user'
import { PARTNER_USER_IDS } from 'common/envs/constants'
import { getUniqueBettorBonusAmount } from 'common/economy'
import { UniqueBettorBonusTxn } from 'common/txn'
import { PerpContract } from 'common/contract'
import { PerpOrderResult } from 'common/perps/orders'
import {
  createSupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import { runTxnOutsideBetQueue } from 'shared/txn/run-txn'
import { getUser, getBettingStreakResetTimeBeforeNow } from 'shared/utils'
import { advancePerpBettingStreak } from './helpers/perp-streak'
import { APIHandler, APIError } from './helpers/endpoint'

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
  for (const id of body.orderIds)
    await pg.tx(async (tx) => {
      const o = await tx.oneOrNone<{
        id: string
        user_id: string
        contract_id: string
        is_api: boolean
        result: PerpOrderResult
        completed_time: string
      }>(
        "select * from perp_orders where id=$1 and status='filled' and participation_applied_at is null for update skip locked",
        [id]
      )
      if (!o) return
      // An old outbox retry cannot grant a new day's streak from yesterday's fill.
      if (
        new Date(o.completed_time).getTime() >=
        getBettingStreakResetTimeBeforeNow()
      )
        await advancePerpBettingStreak(o.user_id, o.contract_id, o.is_api)
      if (o.result.kind === 'trade' && o.result.isNewUniqueBettor)
        await payUniqueBettorBonus(tx, o.contract_id, o.user_id)
      await tx.none(
        'update perp_orders set participation_applied_at=clock_timestamp() where id=$1',
        [id]
      )
      processed++
    })
  return { processed }
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
