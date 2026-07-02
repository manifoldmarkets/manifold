import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getReferralEarnings: APIHandler<'get-referral-earnings'> = async (
  _props,
  auth
) => {
  const pg = createSupabaseDirectClient()
  // Hits the (category, to_id) index on txns; GROUP BY is cheap because the
  // result set is bounded by this user's referral count.
  // referredUserId / referralMultiplier / bonusType are nested at data->'data'
  // (legacy double-wrapping in txnToRow). One row per (referredUser, bonusType)
  // pair, so the frontend can tell apart "M250 first_bet only — verify still
  // possible" vs "M1250 fully paid".
  const rows = await pg.manyOrNone<{
    referred_user_id: string | null
    bonus_type: 'first_bet' | 'verify' | null
    amount_sum: string
    max_multiplier: string | null
  }>(
    `select data->'data'->>'referredUserId' as referred_user_id,
            data->'data'->>'bonusType' as bonus_type,
            sum(amount)::bigint as amount_sum,
            max((data->'data'->>'referralMultiplier')::numeric) as max_multiplier
     from txns
     where to_id = $1
       and category = 'REFERRAL'
     group by data->'data'->>'referredUserId',
              data->'data'->>'bonusType'`,
    [auth.uid]
  )

  type Entry = {
    amount: number
    maxMultiplier: number
    bonusTypes: ('first_bet' | 'verify' | 'legacy')[]
  }
  const byReferredUserId: Record<string, Entry> = {}
  let total = 0
  for (const row of rows) {
    const amount = Number(row.amount_sum)
    total += amount
    if (!row.referred_user_id) continue
    const entry = (byReferredUserId[row.referred_user_id] ??= {
      amount: 0,
      maxMultiplier: 1,
      bonusTypes: [],
    })
    entry.amount += amount
    if (row.max_multiplier) {
      entry.maxMultiplier = Math.max(
        entry.maxMultiplier,
        Number(row.max_multiplier)
      )
    }
    const type = row.bonus_type ?? 'legacy'
    if (!entry.bonusTypes.includes(type)) entry.bonusTypes.push(type)
  }
  return { total, byReferredUserId }
}
