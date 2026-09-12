// On-demand market creation for one Odds API competition, with a dry run,
// from /admin/sports. Same code path as the daily sports-odds-create job.

import { APIError, APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { hasOddsApiKey } from 'shared/the-odds-api-client'
import { createOddsMarketsForCompetition } from 'shared/odds-markets'
import { calendarEntriesFor } from 'common/sports-calendar'

export const adminSportsCreateOddsMarkets: APIHandler<
  'admin-sports-create-odds-markets'
> = async (props, auth) => {
  throwErrorIfNotAdmin(auth.uid)
  const { competitionId, dryRun = false } = props
  if (!hasOddsApiKey()) {
    throw new APIError(500, 'THE_ODDS_API_KEY is not set on the server')
  }
  const entry = calendarEntriesFor(competitionId)[0]
  if (!entry) throw new APIError(400, `Unknown competition: ${competitionId}`)
  if (!entry.oddsKey) {
    throw new APIError(400, `${competitionId} has no Odds API sport key`)
  }

  const pg = createSupabaseDirectClient()
  const r = await createOddsMarketsForCompetition(pg, competitionId, { dryRun })
  return {
    created: r.created,
    skipped: r.skipped,
    errors: r.errors,
    results: r.log,
  }
}
