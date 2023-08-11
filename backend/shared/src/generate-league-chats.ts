import { SupabaseDirectClient } from 'shared/supabase/init'
import { SupabaseClient } from 'common/supabase/utils'
import { log } from 'shared/utils'
import { getLeagueChatChannelId } from 'common/league-chat'

export const generateLeagueChats = async (
  season: number,
  pg: SupabaseDirectClient,
  db: SupabaseClient
) => {
  const leagues = await pg.map(
    `
      select distinct division, cohort from leagues
         where season = $1;
    `,
    [season],
    (row) => ({
      season,
      division: row.division,
      cohort: row.cohort,
    })
  )

  await Promise.all(
    leagues.map(async (league) => {
      const { season, division, cohort } = league
      await db.from('league_chats').insert({
        season,
        division,
        cohort,
        channel_id: getLeagueChatChannelId(season, division, cohort),
      })
    })
  )
  log('Completed creating league chats:', leagues.length)
}
