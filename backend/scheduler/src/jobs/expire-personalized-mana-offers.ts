import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'

// Keep in sync with the redemption grace in `backend/api/src/daimo-webhook.ts`
// and the Stripe atomic UPDATE in `backend/api/src/stripe-endpoints.ts`. The
// 2-hour grace is deliberately long: Stripe Checkout sessions get an
// `expires_at` of offer + 1h, leaving a 1h buffer for webhook latency before
// the SQL grace ends. Daimo's server-side ~1h session is similarly inside
// this window. Users never accidentally pay full price after the offer is
// "visually gone" — the session itself expires before the SQL grace does.
// The cron only flips offers to 'expired' AFTER the grace window closes.
const OFFER_EXPIRY_GRACE_MINUTES = 120

export async function expirePersonalizedManaOffers() {
  const pg = createSupabaseDirectClient()

  const result = await pg.result(
    `update personalized_mana_offers
        set status = 'expired'
      where status = 'active'
        and expires_at is not null
        and expires_at + interval '${OFFER_EXPIRY_GRACE_MINUTES} minutes' < now()`
  )

  if (result.rowCount > 0) {
    log(`Expired ${result.rowCount} personalized mana offers`)
  }
}
