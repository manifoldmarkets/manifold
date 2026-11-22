import { APIHandler } from 'api/helpers/endpoint'
import { getShowcasePins, getTrophyClaims } from 'api/helpers/trophies'
import type { League } from 'common/leagues'
import {
  createSupabaseDirectClient,
  READ_ONLY_REPEATABLE_MODE,
} from 'shared/supabase/init'
import { getEffectiveCurrentSeason } from 'shared/supabase/leagues'

export const getUserTrophies: APIHandler<'get-user-trophies'> = async ({
  userId,
}) => {
  const pg = createSupabaseDirectClient()
  // A snapshot that sees a pin saved after rollover must also see the new
  // season and the membership that made the pin eligible.
  return pg.tx({ mode: READ_ONLY_REPEATABLE_MODE }, async (tx) => {
    const season = await getEffectiveCurrentSeason(tx)
    const claims = await getTrophyClaims(tx, userId)
    const pins = await getShowcasePins(tx, userId)
    const league = await tx.oneOrNone<Pick<League, 'season' | 'division'>>(
      `select season, division from leagues where user_id = $1 and season = $2`,
      [userId, season]
    )
    return { claims, pins, league, season }
  })
}
