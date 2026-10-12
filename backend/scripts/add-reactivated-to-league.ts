import { groupBy, mapValues } from 'lodash'
import { runScript } from 'run-script'
import {
  addToLeagueIfNotInOne,
  getUsersNotInLeague,
} from 'shared/generate-leagues'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { getEffectiveCurrentSeason } from 'shared/supabase/leagues'

if (require.main === module) {
  runScript(async ({ pg }) => {
    const season = await getEffectiveCurrentSeason()
    const userIds = await getUsersNotInLeague(pg, season)
    console.log(`season ${season}, ${userIds.length} userIds`, userIds)
    const divisions = []
    for (const userId of userIds) {
      const league = await addToLeagueIfNotInOne(pg, userId)
      if (!league) {
        console.log('Skipped user', userId)
        continue
      }
      divisions.push(league.division)
      console.log('Added user', userId, 'to league', league.division)
    }
    console.log(
      mapValues(
        groupBy(divisions, (d) => d),
        (d) => d.length
      )
    )
  })
}

const _reassignBots = (pg: SupabaseDirectClient) => {
  return pg.none(
    `update leagues
    set division = 4,
        cohort = 'bots'
    where user_id in (
        select id from users
        where is_bot = true
        limit 40
    )`
  )
}
