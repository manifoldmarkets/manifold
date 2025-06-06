import { APIError, APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  getSeasonEndTimeRow,
  getEffectiveCurrentSeason,
} from 'shared/supabase/leagues'
import { LEAGUES_START } from 'common/leagues'

export const getSeasonInfo: APIHandler<'get-season-info'> = async (props) => {
  const pg = createSupabaseDirectClient()
  const season = props.season ?? (await getEffectiveCurrentSeason())

  const seasonInfo = await getSeasonEndTimeRow(pg, season)
  if (!seasonInfo) {
    throw new APIError(404, 'Season info not found')
  }

  const startTime = new Date(LEAGUES_START)
  startTime.setMonth(startTime.getMonth() + season - 1)
  const startTimeMs = startTime.getTime()
  const { status, end_time } = seasonInfo // Use status directly from DB
  let endTime: number | null = null
  // end time is a mystery if status is active
  if (status !== 'active') {
    endTime = end_time
  }

  return {
    season,
    startTime: startTimeMs,
    endTime,
    status,
  }
}
