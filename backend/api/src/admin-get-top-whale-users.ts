import { MANA_PURCHASE_RATE_CHANGE_DATE, MANA_PURCHASE_RATE_REVERT_DATE } from 'common/envs/constants'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { APIHandler } from './helpers/endpoint'

export const adminGetTopWhaleUsers: APIHandler<
  'admin-get-top-whale-users'
> = async (body, auth) => {
  // Only admins can access this endpoint
  throwErrorIfNotAdmin(auth.uid)

  const { limit = 100 } = body
  const pg = createSupabaseDirectClient()

  // Query to get aggregated purchase data per user, with breakdown by payment type
  const results = await pg.manyOrNone<{
    user_id: string
    username: string
    name: string
    avatar_url: string
    total_paid_cents: string
    total_mana: string
    purchase_count: string
    last_purchase_time: string
    stripe_paid_cents: string
    stripe_mana: string
    stripe_count: string
    apple_paid_cents: string
    apple_mana: string
    apple_count: string
    gidx_paid_cents: string
    gidx_mana: string
    gidx_count: string
    crypto_paid_cents: string
    crypto_mana: string
    crypto_count: string
    unknown_paid_cents: string
    unknown_mana: string
    unknown_count: string
  }>(
    `
    WITH purchase_data AS (
      SELECT 
        t.to_id as user_id,
        t.amount,
        t.created_time,
        COALESCE(t.data->'data'->>'type', 'unknown') as payment_type,
        t.data->'data'->>'paidInCents' as paid_in_cents_text
      FROM txns t
      WHERE t.category = 'MANA_PURCHASE'
    ),
    normalized AS (
      SELECT
        user_id,
        amount,
        created_time,
        payment_type,
        CASE
          -- Expected cents from mana based on historical pricing
          WHEN created_time > $2 and created_time < $3
          THEN amount / 10
          ELSE amount
        END as expected_cents,
        CASE
          WHEN paid_in_cents_text IS NOT NULL THEN
            CASE
              -- Stripe stores dollars in paidInCents field, multiply by 100
              WHEN payment_type = 'stripe'
              THEN (paid_in_cents_text::numeric * 100)
              ELSE paid_in_cents_text::numeric
            END
          ELSE NULL
        END as paid_cents_raw
      FROM purchase_data
    ),
    cleaned AS (
      SELECT
        user_id,
        amount,
        created_time,
        payment_type,
        CASE
          -- If paid cents are missing or wildly off, use mana-derived cents
          WHEN paid_cents_raw IS NULL
            OR paid_cents_raw > expected_cents * 2
            OR paid_cents_raw < expected_cents / 2
          THEN expected_cents
          ELSE paid_cents_raw
        END as paid_cents
      FROM normalized
    ),
    aggregated AS (
      SELECT 
        user_id,
        SUM(paid_cents) as total_paid_cents,
        SUM(amount) as total_mana,
        COUNT(*) as purchase_count,
        MAX(created_time) as last_purchase_time,
        -- Stripe breakdown
        SUM(CASE WHEN payment_type = 'stripe' THEN paid_cents ELSE 0 END) as stripe_paid_cents,
        SUM(CASE WHEN payment_type = 'stripe' THEN amount ELSE 0 END) as stripe_mana,
        COUNT(CASE WHEN payment_type = 'stripe' THEN 1 END) as stripe_count,
        -- Apple breakdown
        SUM(CASE WHEN payment_type = 'apple' THEN paid_cents ELSE 0 END) as apple_paid_cents,
        SUM(CASE WHEN payment_type = 'apple' THEN amount ELSE 0 END) as apple_mana,
        COUNT(CASE WHEN payment_type = 'apple' THEN 1 END) as apple_count,
        -- GIDX breakdown
        SUM(CASE WHEN payment_type = 'gidx' THEN paid_cents ELSE 0 END) as gidx_paid_cents,
        SUM(CASE WHEN payment_type = 'gidx' THEN amount ELSE 0 END) as gidx_mana,
        COUNT(CASE WHEN payment_type = 'gidx' THEN 1 END) as gidx_count,
        -- Crypto breakdown
        SUM(CASE WHEN payment_type = 'crypto' THEN paid_cents ELSE 0 END) as crypto_paid_cents,
        SUM(CASE WHEN payment_type = 'crypto' THEN amount ELSE 0 END) as crypto_mana,
        COUNT(CASE WHEN payment_type = 'crypto' THEN 1 END) as crypto_count,
        -- Unknown breakdown
        SUM(CASE WHEN payment_type NOT IN ('stripe', 'apple', 'gidx', 'crypto') THEN paid_cents ELSE 0 END) as unknown_paid_cents,
        SUM(CASE WHEN payment_type NOT IN ('stripe', 'apple', 'gidx', 'crypto') THEN amount ELSE 0 END) as unknown_mana,
        COUNT(CASE WHEN payment_type NOT IN ('stripe', 'apple', 'gidx', 'crypto') THEN 1 END) as unknown_count
      FROM cleaned
      GROUP BY user_id
    )
    SELECT 
      a.*,
      u.username,
      u.name,
      u.data->>'avatarUrl' as avatar_url
    FROM aggregated a
    JOIN users u ON u.id = a.user_id
    ORDER BY a.total_paid_cents DESC
    LIMIT $1
    `,
    [
      limit,
      MANA_PURCHASE_RATE_CHANGE_DATE.toISOString(),
      MANA_PURCHASE_RATE_REVERT_DATE.toISOString(),
    ]
  )

  const users = results.map((row) => ({
    userId: row.user_id,
    username: row.username,
    name: row.name,
    avatarUrl: row.avatar_url,
    totalPaidCents: Number(row.total_paid_cents),
    totalMana: Number(row.total_mana),
    purchaseCount: Number(row.purchase_count),
    lastPurchaseTime: new Date(row.last_purchase_time).getTime(),
    byType: {
      stripe: {
        paidCents: Number(row.stripe_paid_cents),
        mana: Number(row.stripe_mana),
        count: Number(row.stripe_count),
      },
      apple: {
        paidCents: Number(row.apple_paid_cents),
        mana: Number(row.apple_mana),
        count: Number(row.apple_count),
      },
      gidx: {
        paidCents: Number(row.gidx_paid_cents),
        mana: Number(row.gidx_mana),
        count: Number(row.gidx_count),
      },
      crypto: {
        paidCents: Number(row.crypto_paid_cents),
        mana: Number(row.crypto_mana),
        count: Number(row.crypto_count),
      },
      unknown: {
        paidCents: Number(row.unknown_paid_cents),
        mana: Number(row.unknown_mana),
        count: Number(row.unknown_count),
      },
    },
  }))

  return { users }
}
