import { APIHandler } from './helpers/endpoint'
import { getBrowsePersonalizationEligibility } from 'shared/browse-personalization'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getBrowsePersonalization: APIHandler<
  'get-browse-personalization'
> = async (_, auth) => ({
  eligible: await getBrowsePersonalizationEligibility(
    createSupabaseDirectClient(),
    auth.uid
  ),
})
