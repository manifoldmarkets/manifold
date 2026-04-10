import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'

export const adminGetManaSales: APIHandler<'admin-get-mana-sales'> = async (
  body,
  auth
) => {
  // Only admins can access this endpoint
  throwErrorIfNotAdmin(auth.uid)

  const { limit = 100 } = body
  const pg = createSupabaseDirectClient()

  const results = await pg.manyOrNone<{
    id: string
    created_time: string
    to_id: string
    amount: number
    data: {
      type?: 'stripe' | 'apple' | 'gidx'
      paidInCents?: number
    }
    username: string
    name: string
    avatar_url: string
  }>(
    `SELECT 
      t.id,
      t.created_time,
      t.to_id,
      t.amount,
      t.data->'data' as data,
      u.username,
      u.name,
      u.data->>'avatarUrl' as avatar_url
    FROM txns t
    JOIN users u ON u.id = t.to_id
    WHERE t.category = 'MANA_PURCHASE'
    ORDER BY t.created_time DESC
    LIMIT $1`,
    [limit]
  )

  const sales = results.map((row) => {
    const rawPaidInCents = row.data?.paidInCents ?? null
    const paymentType = (row.data?.type ?? 'unknown') as
      | 'stripe'
      | 'apple'
      | 'gidx'
      | 'crypto'
      | 'unknown'
    // Stripe stores dollars in paidInCents (metadata priceInDollars).
    const normalizedPaidInCents =
      rawPaidInCents !== null && paymentType === 'stripe'
        ? Math.round(rawPaidInCents * 100)
        : rawPaidInCents

    return {
    id: row.id,
    createdTime: new Date(row.created_time).getTime(),
    userId: row.to_id,
    username: row.username,
    name: row.name,
    avatarUrl: row.avatar_url,
    amount: row.amount,
    paidInCents: normalizedPaidInCents,
      paymentType,
    }
  })

  return { sales }
}
