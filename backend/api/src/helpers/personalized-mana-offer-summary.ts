import { SupabaseDirectClient } from 'shared/supabase/init'
import {
  OFFER_MANA_AMOUNT,
  OFFER_PRICE_CRYPTO,
  OFFER_PRICE_STRIPE,
  PersonalizedManaOfferSummary,
} from 'common/personalized-mana-offer'

// Builds the offer summary that the get / activate / dismiss endpoints all
// return. activeCount + nextExpiresAt + nextRedeemableOfferId reflect only
// non-dismissed active offers (what drives the card + sidebar badge).
// dismissedCount + dismissedNext* expose the dismissed-but-still-active
// bucket so the frontend can show the "N hidden offer(s)" chip and honor
// the ?showOffer override from the notification deep link.
export const buildPersonalizedManaOfferSummary = async (
  pg: SupabaseDirectClient,
  userId: string
): Promise<PersonalizedManaOfferSummary> => {
  const rows = await pg.manyOrNone<{
    id: string
    status: string
    expires_at: string | null
    dismissed_at: string | null
  }>(
    `select id, status, expires_at, dismissed_at
       from personalized_mana_offers
      where user_id = $1
        and status in ('pending', 'active')`,
    [userId]
  )

  let pendingCount = 0
  let activeCount = 0
  let dismissedCount = 0
  let nextExpiresAt: number | null = null
  let nextRedeemableOfferId: string | null = null
  let dismissedNextExpiresAt: number | null = null
  let dismissedNextRedeemableOfferId: string | null = null

  for (const row of rows) {
    if (row.status === 'pending') {
      pendingCount++
      continue
    }
    if (row.status !== 'active') continue
    const ts = row.expires_at ? new Date(row.expires_at).getTime() : null
    if (row.dismissed_at) {
      dismissedCount++
      if (
        ts != null &&
        (dismissedNextExpiresAt == null || ts < dismissedNextExpiresAt)
      ) {
        dismissedNextExpiresAt = ts
        dismissedNextRedeemableOfferId = row.id
      }
    } else {
      activeCount++
      if (ts != null && (nextExpiresAt == null || ts < nextExpiresAt)) {
        nextExpiresAt = ts
        nextRedeemableOfferId = row.id
      }
    }
  }

  return {
    pendingCount,
    activeCount,
    dismissedCount,
    nextExpiresAt,
    nextRedeemableOfferId,
    dismissedNextExpiresAt,
    dismissedNextRedeemableOfferId,
    manaAmount: OFFER_MANA_AMOUNT,
    priceUsdStripe: OFFER_PRICE_STRIPE,
    priceUsdCrypto: OFFER_PRICE_CRYPTO,
  }
}
