import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { buildPersonalizedManaOfferSummary } from './helpers/personalized-mana-offer-summary'

export const getPersonalizedManaOffers: APIHandler<
  'get-personalized-mana-offers'
> = async (_props, auth) => {
  const pg = createSupabaseDirectClient()
  return buildPersonalizedManaOfferSummary(pg, auth.uid)
}
