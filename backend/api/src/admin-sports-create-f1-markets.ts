// On-demand F1 market creation from BALLDONTLIE, with a dry run, from
// /admin/sports, on dev or prod. The daily sports-f1-create job makes them
// too, for a phase switched on; by hand, every phase counts.

import { APIError, APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getF1ClientStatus } from 'shared/balldontlie-f1-client'
import { withF1ApiRead } from 'shared/bdl/f1-read-role'
import { createF1Markets } from 'shared/f1-markets'
import { calendarEntriesFor } from 'common/sports-calendar'

export const adminSportsCreateF1Markets: APIHandler<
  'admin-sports-create-f1-markets'
> = async (props, auth) => {
  throwErrorIfNotAdmin(auth.uid)
  const { competitionId, dryRun = false, keys } = props
  if (calendarEntriesFor(competitionId)[0]?.sport !== 'f1') {
    throw new APIError(400, `${competitionId} is not an F1 competition`)
  }
  const status = getF1ClientStatus()
  if (status === 'rollout-disabled')
    throw new APIError(
      503,
      'F1 market creation is disabled on this dev deployment.'
    )
  if (status === 'missing-key') {
    throw new APIError(500, 'BALLDONTLIE_API_KEY is not set on the server')
  }

  const pg = createSupabaseDirectClient()
  try {
    const r = await withF1ApiRead(() =>
      createF1Markets(pg, competitionId, { dryRun, keys })
    )
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
