import * as functions from 'firebase-functions'

import { log, revalidateStaticProps } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { bulkUpdate } from 'shared/supabase/utils'
import { secrets } from 'common/secrets'
import { SEASONS } from 'common/leagues'

export const updateLeagueRanks = functions
  .runWith({
    secrets,
  })
  .pubsub.schedule('0 0 * * *')
  .timeZone('America/Los_Angeles')
  .onRun(async () => {
    await updateLeagueRanksCore()
  })

export async function updateLeagueRanksCore() {
  const pg = createSupabaseDirectClient()

  const season = SEASONS[SEASONS.length - 1]

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
      rank_snapshot: +u.rank,
    }
  })

  await bulkUpdate(pg, 'leagues', 'user_id', rankUpdates)
  await revalidateStaticProps('/leagues')
  log('Done.')
}
