import { groupBy } from 'lodash'
import { pgp, SupabaseDirectClient } from './supabase/init'
import { genNewAdjectiveAnimal } from 'common/util/adjective-animal'
import { BOT_USERNAMES } from 'common/envs/constants'
import { COHORT_SIZE, CURRENT_SEASON, MAX_COHORT_SIZE } from 'common/leagues'
import { getCurrentPortfolio } from './helpers/portfolio'

export async function assignCohorts(pg: SupabaseDirectClient) {
  const userDivisons = await pg.many<{ user_id: string; division: number }>(
    `
  with user_bet_count as (
    select users.id as user_id, count(*) as bet_count
    from users
    join contract_bets on contract_bets.user_id = users.id
    where created_time > (now() - interval '2 weeks')
    and coalesce(users.data->>'isBannedFromPosting', 'false') = 'false'
    and users.data->>'username' not in ($1:csv)
    group by users.id
  ), user_profit as (
    select
      user_id,
      bet_count,
      (users.data->'profitCached'->>'allTime')::numeric
      + coalesce((users.data->'creatorTraders'->>'allTime')::numeric, 0) * 5
       as profit,
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
  order by score desc`,
    [BOT_USERNAMES]
  )

  const usersByDivision = groupBy(userDivisons, 'division')
  const userCohorts: {
    [userId: string]: { division: number; cohort: string }
  } = {}
  const cohortSet = new Set<string>()

  for (const divisionStr in usersByDivision) {
    const divisionUsers = usersByDivision[divisionStr]
    const division = Number(divisionStr)
    const numCohorts = Math.ceil(divisionUsers.length / COHORT_SIZE)
    const usersPerCohort = Math.ceil(divisionUsers.length / numCohorts)
    const cohortsWithOneLess =
      usersPerCohort * numCohorts - divisionUsers.length
    console.log(
      'division users',
      divisionUsers.length,
      'numCohorts',
      numCohorts,
      'usersPerCohort',
      usersPerCohort,
      'cohortsWithOneLess',
      cohortsWithOneLess
    )

    let remainingUserIds = divisionUsers.map((u) => u.user_id)
    const jamesId = '5LZ4LgYuySdL1huCWe7bti02ghx2'
    if (remainingUserIds.includes(jamesId)) {
      remainingUserIds = [
        jamesId,
        ...remainingUserIds.filter((u) => u !== jamesId),
      ]
    }
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

      const cohort = genNewAdjectiveAnimal(cohortSet)
      cohortSet.add(cohort)

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

  await deleteSeason(pg, 1)

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

// Be careful with this one.
export const deleteSeason = (pg: SupabaseDirectClient, season: number) => {
  return pg.none('delete from leagues where season = $1', [season])
}

const getSmallestCohort = async (
  pg: SupabaseDirectClient,
  season: number,
  division: number
) => {
  return await pg.one<{ cohort: string; count: number }>(
    `select cohort, count(user_id) as count from leagues
    where season = $1
      and division = $2
    group by cohort
    order by count(user_id) ASC
    limit 1`,
    [season, division]
  )
}

const generateNewCohortName = async (
  pg: SupabaseDirectClient,
  season: number
) => {
  const cohortData = await pg.many<{ cohort: string }>(
    `select distinct cohort from leagues where season = $1`,
    [season]
  )
  const cohortSet = new Set(cohortData.map((d) => d.cohort))
  return genNewAdjectiveAnimal(cohortSet)
}

export const addUserToLeague = async (
  pg: SupabaseDirectClient,
  userId: string,
  season: number,
  division: number
) => {
  const { cohort: smallestCohort, count } = await getSmallestCohort(
    pg,
    season,
    division
  )
  const cohort =
    count >= MAX_COHORT_SIZE
      ? await generateNewCohortName(pg, season)
      : smallestCohort

  console.log(
    'Inserting user',
    userId,
    'into division',
    division,
    'cohort',
    cohort
  )

  await pg.none(
    `insert into leagues (user_id, season, division, cohort)
      values ($1, $2, $3, $4)`,
    [userId, season, division, cohort]
  )
  return cohort
}

export const getUsersNotInLeague = async (
  pg: SupabaseDirectClient,
  season: number
) => {
  const rows = await pg.manyOrNone<{ id: string }>(
    `
    select distinct users.id
    from users
    left join leagues on users.id = leagues.user_id
    join contract_bets cb on users.id = cb.user_id
    where
      (leagues.user_id is null or leagues.season != $1)
      and cb.created_time > to_date('20230501', 'YYYYMMDD')
    `,
    [season]
  )
  return rows.map((r) => r.id)
}

const portfolioToDivision = (portfolio: {
  balance: number
  investmentValue: number
}) => {
  const value = portfolio.balance + portfolio.investmentValue
  if (value < 1500) return 1
  if (value < 5000) return 2
  return 3
}

export const addToLeagueIfNotInOne = async (
  pg: SupabaseDirectClient,
  userId: string
) => {
  const season = CURRENT_SEASON

  const existingLeague = await pg.oneOrNone<{
    season: number
    division: number
    cohort: string
  }>(
    `select season, division, cohort from leagues where user_id = $1 and season = $2`,
    [userId, season]
  )
  if (existingLeague) {
    return existingLeague
  }

  const portfolio = await getCurrentPortfolio(pg, userId)
  const division = portfolio ? portfolioToDivision(portfolio) : 1
  const cohort = await addUserToLeague(pg, userId, season, division)
  return { season, division, cohort }
}
