import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { OFFER_DURATION_MS } from 'common/personalized-mana-offer'
import { buildPersonalizedManaOfferSummary } from './helpers/personalized-mana-offer-summary'

const HOURS = OFFER_DURATION_MS / (60 * 60 * 1000)

export const activatePersonalizedManaOffers: APIHandler<
  'activate-personalized-mana-offers'
> = async (_props, auth) => {
  const pg = createSupabaseDirectClient()

  await pg.none(
    `update personalized_mana_offers
        set status = 'active',
            activated_at = now(),
            expires_at = now() + ($2 * interval '1 hour')
      where user_id = $1
        and status = 'pending'`,
    [auth.uid, HOURS]
  )

  return buildPersonalizedManaOfferSummary(pg, auth.uid)
}
