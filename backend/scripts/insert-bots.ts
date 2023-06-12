import { BOT_USERNAMES } from 'common/envs/constants'
import { getSeasonDates } from 'common/leagues'
import { runScript } from 'run-script'
import { bulkInsert } from 'shared/supabase/utils'

if (require.main === module) {
  runScript(async ({ pg }) => {
    const season = 2
    const prevSeason = season - 1

    // const alreadyAssignedBotIds = await pg.map(
    //   `delete from leagues
    //   where season = $1
    //   and user_id in (
    //     select id from users
    //     where data->>'username' in ($2:csv)
    //   )
    //   `,
    //   [season, BOT_USERNAMES],
    //   (r) => r.user_id
    // )

    // console.log('alreadyAssignedBotIds', alreadyAssignedBotIds)

    const startDate = getSeasonDates(prevSeason).start
    const botIds = await pg.map(
      `with active_user_ids as (
        select distinct user_id
        from contract_bets
        where contract_bets.created_time > $1
      )
      select id from users
      where data->>'username' in ($2:csv)
      and id in (select user_id from active_user_ids)
    `,
      [startDate, BOT_USERNAMES],
      (r) => r.id
    )

    console.log('botIds', botIds)
    const botInserts = botIds.map((id) => ({
      user_id: id,
      season,
      division: 0,
      cohort: 'prophetic-programs',
    }))
    console.log('botInserts', botInserts)
    await bulkInsert(pg, 'leagues', botInserts)
  })
}
