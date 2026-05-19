import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { buildPersonalizedManaOfferSummary } from './helpers/personalized-mana-offer-summary'

// Toggles dismiss state across ALL active offers for the calling user.
// dismissed=true: user clicked the X on the offer card -> hide card + badge.
// dismissed=false: user clicked the "show hidden offer(s)" chip -> reveal.
// Pending offers are not touched; dismiss is a presentation flag for the
// active bucket only. Status, expiry, and the pending lock are unaffected.
export const dismissPersonalizedManaOffer: APIHandler<
  'dismiss-personalized-mana-offer'
> = async ({ dismissed }, auth) => {
  const pg = createSupabaseDirectClient()

  await pg.none(
    `update personalized_mana_offers
        set dismissed_at = $2
      where user_id = $1
        and status = 'active'`,
    [auth.uid, dismissed ? new Date().toISOString() : null]
  )

  return buildPersonalizedManaOfferSummary(pg, auth.uid)
}
