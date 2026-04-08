import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from 'api/helpers/endpoint'
import { tsToMillis } from 'common/supabase/utils'

export const getSweepstakesSales: APIHandler<'get-sweepstakes-sales'> = async (
  props
) => {
  const { sweepstakesNum, limit, before } = props
  const safeLimit = Math.min(Math.max(limit ?? 100, 1), 500)
  const beforeId = typeof before === 'string' && before.length > 0 ? before : undefined
  const safeSweepstakesNum = Math.max(0, Math.floor(sweepstakesNum))
  const pg = createSupabaseDirectClient()

  const beforeSale = beforeId
    ? await pg.oneOrNone<{ created_time: string; id: string }>(
        `SELECT created_time, id
         FROM sweepstakes_tickets
         WHERE sweepstakes_num = $1
           AND id = $2`,
        [safeSweepstakesNum, beforeId]
      )
    : undefined

  if (beforeId && !beforeSale) {
    return { sales: [] }
  }

  const sales = await pg.manyOrNone<{
    id: string
    sweepstakes_num: number
    user_id: string
    num_tickets: string
    mana_spent: string
    is_free: boolean
    created_time: string
  }>(
    `SELECT id, sweepstakes_num, user_id, num_tickets, mana_spent, is_free, created_time
     FROM sweepstakes_tickets
     WHERE sweepstakes_num = $1
     ${
       beforeSale
         ? `AND (
              created_time < $3
              OR (created_time = $3 AND id < $4)
            )`
         : ''
     }
     ORDER BY created_time DESC, id DESC
     LIMIT $2`,
    beforeSale
      ? [safeSweepstakesNum, safeLimit, beforeSale.created_time, beforeSale.id]
      : [safeSweepstakesNum, safeLimit]
  )

  return {
    sales: sales.map((s) => ({
      id: s.id,
      sweepstakesNum: s.sweepstakes_num,
      userId: s.user_id,
      numTickets: parseFloat(s.num_tickets),
      manaSpent: parseFloat(s.mana_spent),
      isFree: s.is_free,
      createdTime: tsToMillis(s.created_time),
    })),
  }
}
