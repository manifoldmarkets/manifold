import { log, revalidateStaticProps } from 'shared/utils'
import {
  SupabaseDirectClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { bulkUpdate } from 'shared/supabase/utils'
import { getEffectiveCurrentSeason } from 'shared/supabase/leagues'

export async function updateLeagueRanks(
  manualSeason?: number,
  tx?: SupabaseDirectClient
) {
  const pg = tx ?? createSupabaseDirectClient()

  const season = manualSeason ?? (await getEffectiveCurrentSeason())

  log('Loading user ranks...')
  const userIds = await pg.manyOrNone<{ id: string; rank: number }>(
    `select id, rank from users
    join user_league_info uli on uli.user_id = users.id
    where uli.season = $1`,
    [season]
  )
  log(`Loaded ${userIds.length} user ids and ranks.`)

  const rankUpdates = userIds.map((u) => {
    return {
      user_id: u.id,
      season,
      rank_snapshot: +u.rank,
    }
  })

  await bulkUpdate(pg, 'leagues', ['user_id', 'season'], rankUpdates)
  await revalidateStaticProps('/leagues')
  log('Done.')
}
