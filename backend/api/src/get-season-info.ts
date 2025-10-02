import { APIError, APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  getEffectiveCurrentSeason,
  getSeasonStartAndEnd,
} from 'shared/supabase/leagues'

export const getSeasonInfo: APIHandler<'get-season-info'> = async (props) => {
  const pg = createSupabaseDirectClient()
  const season = props.season ?? (await getEffectiveCurrentSeason())

  const boundaries = await getSeasonStartAndEnd(pg, season)
  if (!boundaries) {
    throw new APIError(404, 'Season info not found')
  }

  const { seasonStart, seasonEnd, status } = boundaries
  let endTime: number | null = null
  // end time is a mystery if status is active
  if (status !== 'active') {
    endTime = seasonEnd
  }

  return {
    season,
    startTime: seasonStart,
    endTime,
    status,
  }
}
