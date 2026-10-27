// On-demand F1 market creation from BALLDONTLIE, with a dry run, from
// /admin/sports. Dev only: there is no job or resolver yet, so a market made
// here is resolved by hand, and prod refuses.

import { APIError, APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { isProd } from 'shared/utils'
import { hasBalldontlieKey } from 'shared/balldontlie-f1-client'
import { createF1Markets } from 'shared/f1-markets'
import { calendarEntriesFor } from 'common/sports-calendar'

export const adminSportsCreateF1Markets: APIHandler<
  'admin-sports-create-f1-markets'
> = async (props, auth) => {
  throwErrorIfNotAdmin(auth.uid)
  if (isProd()) {
    throw new APIError(
      403,
      'F1 markets can only be created on dev until the F1 jobs ship'
    )
  }
  const { competitionId, dryRun = false, keys } = props
  if (calendarEntriesFor(competitionId)[0]?.sport !== 'f1') {
    throw new APIError(400, `${competitionId} is not an F1 competition`)
  }
  if (!hasBalldontlieKey()) {
    throw new APIError(500, 'BALLDONTLIE_API_KEY is not set on the server')
  }

  const pg = createSupabaseDirectClient()
  try {
    const r = await createF1Markets(pg, competitionId, { dryRun, keys })
    return {
      created: r.created,
      skipped: r.skipped,
      errors: r.errors,
      results: r.log,
    }
  } catch (e) {
    // Only the provider fails the run; say why on the admin page.
    throw new APIError(500, e instanceof Error ? e.message : String(e))
  }
}
