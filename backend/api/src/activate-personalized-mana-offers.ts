import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  OFFER_DURATION_MS,
  OFFER_MANA_AMOUNT,
  OFFER_PRICE_CRYPTO,
  OFFER_PRICE_STRIPE,
  PersonalizedManaOfferSummary,
} from 'common/personalized-mana-offer'

const HOURS = OFFER_DURATION_MS / (60 * 60 * 1000)

export const activatePersonalizedManaOffers: APIHandler<
  'activate-personalized-mana-offers'
> = async (_props, auth) => {
  const pg = createSupabaseDirectClient()

  await pg.tx(async (tx) => {
    await tx.none(
      `update personalized_mana_offers
          set status = 'active',
              activated_at = now(),
              expires_at = now() + ($2 * interval '1 hour')
        where user_id = $1
          and status = 'pending'`,
      [auth.uid, HOURS]
    )
  })

  const rows = await pg.manyOrNone<{
    status: string
    expires_at: string | null
    id: string
  }>(
    `select id, status, expires_at
       from personalized_mana_offers
      where user_id = $1
        and status in ('pending', 'active')`,
    [auth.uid]
  )

  let pendingCount = 0
  let activeCount = 0
  let nextExpiresAt: number | null = null
  let nextRedeemableOfferId: string | null = null

  for (const row of rows) {
    if (row.status === 'pending') {
      pendingCount++
    } else if (row.status === 'active') {
      activeCount++
      const ts = row.expires_at ? new Date(row.expires_at).getTime() : null
      if (ts != null && (nextExpiresAt == null || ts < nextExpiresAt)) {
        nextExpiresAt = ts
        nextRedeemableOfferId = row.id
      }
    }
  }

  const summary: PersonalizedManaOfferSummary = {
    pendingCount,
    activeCount,
    nextExpiresAt,
    nextRedeemableOfferId,
    manaAmount: OFFER_MANA_AMOUNT,
    priceUsdStripe: OFFER_PRICE_STRIPE,
    priceUsdCrypto: OFFER_PRICE_CRYPTO,
  }

  return summary
}
