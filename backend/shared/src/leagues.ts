import { groupBy } from 'lodash'
import { pgp, SupabaseDirectClient } from './supabase/init'
import { randomString } from 'common/util/random'

const COHORT_SIZE = 25

export async function assignCohorts(pg: SupabaseDirectClient) {
  const userDivisons = await pg.many<{ user_id: string; division: number }>(`
  with user_bet_count as (
    select users.id as user_id, count(*) as bet_count
    from users
    join contract_bets on contract_bets.user_id = users.id
    where created_time > (now() - interval '2 weeks')
    group by users.id
  ), user_profit as (
    select
      user_id,
      bet_count,
      (users.data->'profitCached'->>'allTime')::numeric as profit,
      ntile(100) over (order by (users.data->'profitCached'->>'allTime')::numeric) / 100.0 as profit_rank
    from user_bet_count
    join users on users.id = user_id
    where bet_count > 0
  ), user_score as (
    select
      user_id,
      bet_count,
      profit,
      profit_rank,
      log(bet_count + 5) * pow(profit_rank, 2) as score,
      percent_rank() over (order by log(bet_count + 5) * pow(profit_rank, 2) desc) as score_percentile
    from user_profit
  )
  select
    user_id,
    bet_count,
    profit,
    profit_rank,
    score,
    case
      when score_percentile < 0.111 then 4
      when score_percentile >= 0.111 and score_percentile < 0.333 then 3
      when score_percentile >= 0.333 and score_percentile < 0.555 then 2
      else 1
    end as division
  from user_score
  order by score desc`)

  const usersByDivision = groupBy(userDivisons, 'division')
  const userCohorts: {
    [userId: string]: { division: number; cohort: string }
  } = {}

  for (const divisionStr in usersByDivision) {
    const divisionUsers = usersByDivision[divisionStr]
    const division = Number(divisionStr)
    const numCohorts = Math.ceil(divisionUsers.length / COHORT_SIZE)
    const usersPerCohort = Math.ceil(divisionUsers.length / numCohorts)
    const cohortsWithOneLess =
      usersPerCohort * numCohorts - divisionUsers.length
    console.log(
      'division',
      divisionUsers.length,
      'numCohorts',
      numCohorts,
      'usersPerCohort',
      usersPerCohort,
      'cohortsWithOneLess',
      cohortsWithOneLess
    )

    let remainingUserIds = divisionUsers.map((u) => u.user_id)
    let i = 0
    while (remainingUserIds.length > 0) {
      const cohortSize =
        i < cohortsWithOneLess ? usersPerCohort - 1 : usersPerCohort
      const cohortOfUsers = (
        await pg.many<{ user_id: string }>(
          `select user_id from user_embeddings
        where user_id = any($2)
        order by user_embeddings.interest_embedding <=> (
          select interest_embedding from user_embeddings where user_id = $1
        )`,
          [remainingUserIds[0], remainingUserIds, cohortSize]
        )
      ).slice(0, cohortSize)
      const cohort = randomString()
      for (const user of cohortOfUsers) {
        userCohorts[user.user_id] = { division, cohort }
      }
      remainingUserIds = divisionUsers
        .map((u) => u.user_id)
        .filter((uid) => !userCohorts[uid])
      i++
      console.log('cohort', cohort, cohortOfUsers.length)
    }
  }

  const leagueInserts = Object.entries(userCohorts).map(
    ([userId, { division, cohort }]) => ({
      user_id: userId,
      season: 1,
      division,
      cohort,
    })
  )
  console.log('league inserts', leagueInserts)
  console.log('Inserting', leagueInserts.length, 'cohort rows')

  // Bulk insert leagues.
  const insertStatement =
    pgp.helpers.insert(
      leagueInserts,
      Object.keys(leagueInserts[0]),
      'leagues'
    ) +
    ` on conflict (user_id, season) do update set
    division = excluded.division,
    cohort = excluded.cohort`
  await pg.none(insertStatement)
}
