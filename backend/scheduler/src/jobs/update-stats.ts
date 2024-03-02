import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
dayjs.extend(utc)
dayjs.extend(timezone)

import {
  range,
  zip,
  uniq,
  sum,
  sumBy,
  countBy,
  groupBy,
  mapValues,
  intersection,
} from 'lodash'
import { log, logMemory, revalidateStaticProps } from 'shared/utils'
import { Stats } from 'common/stats'
import { DAY_MS } from 'common/util/time'
import { average, median } from 'common/util/math'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { bulkUpsert } from 'shared/supabase/utils'
import { saveCalibrationData } from 'shared/calculate-calibration'
import { ManaPurchaseTxn } from 'common/txn'
import { isUserLikelySpammer } from 'common/user'
import { convertTxn } from 'common/supabase/txns'

const numberOfDays = 365

interface StatEvent {
  id: string
  userId: string
  ts: number
}
type StatBet = StatEvent & { amount: number }
type StatUser = StatEvent & {
  d1BetCount: number
  freeQuestionsCreated: number | undefined
  bio: string | undefined
  dashboardCount: number
  referrerId: string | undefined
}

async function getDailyBets(
  pg: SupabaseDirectClient,
  startTime: number,
  numberOfDays: number
) {
  const bets = await pg.manyOrNone(
    `select
      extract(day from (millis_to_ts($2) - created_time)) as day,
      ts_to_millis(created_time) as ts,
      user_id,
      amount,
      bet_id
    from contract_bets
    where
      created_time >= millis_to_ts($1)
      and created_time < millis_to_ts($2)
      and is_redemption = false
    `,
    [startTime, startTime + numberOfDays * DAY_MS]
  )
  const betsByDay: StatBet[][] = range(0, numberOfDays).map((_) => [])
  for (const r of bets) {
    betsByDay[(numberOfDays - 1 - r.day) as number].push({
      id: r.bet_id as string,
      userId: r.user_id as string,
      ts: r.ts as number,
      amount: parseFloat(r.amount as string),
    } as const)
  }
  return betsByDay
}

async function getDailyComments(
  pg: SupabaseDirectClient,
  startTime: number,
  numberOfDays: number
) {
  const comments = await pg.manyOrNone(
    `select
      extract(day from millis_interval((data->'createdTime')::bigint, $2)) as day,
      (data->'createdTime')::bigint as ts,
      data->>'userId' as user_id,
      comment_id
    from contract_comments
    where (data->'createdTime')::bigint >= $1 and (data->'createdTime')::bigint < $2`,
    [startTime, startTime + numberOfDays * DAY_MS]
  )
  const commentsByDay: StatEvent[][] = range(0, numberOfDays).map((_) => [])
  for (const r of comments) {
    commentsByDay[(numberOfDays - 1 - r.day) as number].push({
      id: r.comment_id as string,
      userId: r.user_id as string,
      ts: r.ts as number,
    } as const)
  }
  return commentsByDay
}

async function getDailyContracts(
  pg: SupabaseDirectClient,
  startTime: number,
  numberOfDays: number
) {
  const contracts = await pg.manyOrNone(
    `select extract(day from (millis_to_ts($2) - created_time)) as day, created_time, creator_id, id
    from contracts
    where created_time >= millis_to_ts($1) and created_time < millis_to_ts($2)`,
    [startTime, startTime + numberOfDays * DAY_MS]
  )
  const contractsByDay: StatEvent[][] = range(0, numberOfDays).map((_) => [])
  for (const r of contracts) {
    contractsByDay[(numberOfDays - 1 - r.day) as number].push({
      id: r.id as string,
      userId: r.creator_id as string,
      ts: r.created_time as number,
    } as const)
  }
  return contractsByDay
}

async function getDailyNewUsers(
  pg: SupabaseDirectClient,
  startTime: number,
  numberOfDays: number
) {
  const users = await pg.manyOrNone(
    `select
      extract(day from millis_interval((u.data->'createdTime')::bigint, $2)) as day,
      (u.data->'createdTime')::bigint as ts,
      u.id,
      (u.data->>'bio') as bio,
      (u.data->'freeQuestionsCreated')::int as free_questions_created,
      count(cb.bet_id) filter (where cb.bet_id is not null) as bet_count_within_24h,
      count(d.id) filter (where d.id is not null) as dashboard_count,
      u.data->>'referredByUserId' as referrer_id
  from users u
      left join contract_bets cb on u.id = cb.user_id and cb.is_redemption = false
      and (cb.created_time >= u.created_time and cb.created_time <= u.created_time + interval '24 hours')
      left join dashboards d on u.id = d.creator_id
      and (d.created_time >= millis_to_ts($1) and d.created_time < millis_to_ts($2))
    where (u.created_time >= millis_to_ts($1) and u.created_time < millis_to_ts($2))
    and u.data->>'fromLove' is null
  group by u.id;
    `,
    [startTime, startTime + numberOfDays * DAY_MS]
  )

  const usersByDay: StatUser[][] = range(0, numberOfDays).map((_) => [])

  for (const r of users) {
    usersByDay[(numberOfDays - 1 - r.day) as number].push({
      id: r.id as string,
      userId: r.id as string,
      ts: r.ts as number,
      d1BetCount: Number(r.bet_count_within_24h as number), // count returns bigint
      freeQuestionsCreated: r.free_questions_created ?? undefined,
      bio: r.bio ?? undefined,
      dashboardCount: Number(r.dashboard_count as number), // count returns bigint
      referrerId: r.referrer_id ?? undefined,
    } as const)
  }
  return usersByDay
}

export async function getSales(
  pg: SupabaseDirectClient,
  startTime: number,
  numberOfDays: number
) {
  const sales: ManaPurchaseTxn[] = await pg.map(
    `select * from txns
      where category = 'MANA_PURCHASE'
      and created_time >= millis_to_ts($1) and created_time < millis_to_ts($2)`,
    [startTime, startTime + numberOfDays * DAY_MS],
    convertTxn as any
  )

  const salesByDay = range(0, numberOfDays).map(() => [] as any[])
  for (const sale of sales) {
    const ts = sale.createdTime
    const amount = sale.amount / 100 // convert to dollars
    const userId = sale.toId
    const id = sale.id
    const dayIndex = Math.floor((ts - startTime) / DAY_MS)
    salesByDay[dayIndex].push({ id, userId, ts, amount })
  }

  return salesByDay
}

export const updateStatsCore = async () => {
  const pg = createSupabaseDirectClient()

  const start = dayjs()
    .subtract(numberOfDays, 'day')
    .tz('America/Los_Angeles')
    .startOf('day')
    .valueOf()

  log('Fetching data for stats update...')
  const [
    dailyBets,
    dailyContracts,
    dailyComments,
    dailyNewUsers,
    dailyManaSales,
  ] = await Promise.all([
    getDailyBets(pg, start, numberOfDays),
    getDailyContracts(pg, start, numberOfDays),
    getDailyComments(pg, start, numberOfDays),
    getDailyNewUsers(pg, start, numberOfDays),
    getSales(pg, start, numberOfDays),
  ])
  logMemory()

  const dailyNewRealUsers = dailyNewUsers.map((users) =>
    users.filter(
      (user) =>
        !isUserLikelySpammer(
          user,
          user.d1BetCount > 0,
          user.dashboardCount > 0
        ) && user.referrerId !== 'cA1JupYR5AR8btHUs2xvkui7jA93' // Ignore ad-sourced users
    )
  )

  const dailyBetCounts = dailyBets.map((bets) => bets.length)

  const dailyContractCounts = dailyContracts.map(
    (contracts) => contracts.length
  )
  const dailyCommentCounts = dailyComments.map((comments) => comments.length)
  const dailyNewUserCounts = dailyNewUsers.map((users) => users.length)

  const dailySales = dailyManaSales.map((sales) =>
    sum(sales.map((s) => s.amount))
  )

  const dailyUserIds = zip(dailyContracts, dailyBets, dailyComments).map(
    ([contracts, bets, comments]) => {
      const creatorIds = (contracts ?? []).map((c) => c.userId)
      const betUserIds = (bets ?? []).map((bet) => bet.userId)
      const commentUserIds = (comments ?? []).map((comment) => comment.userId)
      return uniq([...creatorIds, ...betUserIds, ...commentUserIds])
    }
  )

  const avgDailyUserActions = zip(dailyContracts, dailyBets, dailyComments).map(
    ([contracts, bets, comments]) => {
      const creatorIds = (contracts ?? []).map((c) => c.userId)
      const betUserIds = (bets ?? []).map((bet) => bet.userId)
      const commentUserIds = (comments ?? []).map((comment) => comment.userId)
      const allIds = [...creatorIds, ...betUserIds, ...commentUserIds]
      if (allIds.length === 0) return 0

      const userIdCounts = countBy(allIds, (id) => id)
      const countsFiltered = Object.values(userIdCounts).filter((c) => c > 1)
      return countsFiltered.length === 0 ? 0 : median(countsFiltered)
    }
  )

  log(
    `Fetched ${sum(dailyBetCounts)} bets, ${sum(
      dailyContractCounts
    )} contracts, ${sum(dailyCommentCounts)} comments, from ${sum(
      dailyNewUserCounts
    )} unique users.`
  )

  const dailyActiveUsers = dailyUserIds.map((userIds) => userIds.length)
  const dailyActiveUsersWeeklyAvg = dailyUserIds.map((_, i) => {
    const start = Math.max(0, i - 6)
    const end = i + 1
    return average(dailyActiveUsers.slice(start, end))
  })

  const weeklyActiveUsers = dailyUserIds.map((_, i) => {
    const start = Math.max(0, i - 6)
    const end = i + 1
    const uniques = new Set<string>(dailyUserIds.slice(start, end).flat())
    return uniques.size
  })

  const monthlyActiveUsers = dailyUserIds.map((_, i) => {
    const start = Math.max(0, i - 29)
    const end = i + 1
    const uniques = new Set<string>(dailyUserIds.slice(start, end).flat())
    return uniques.size
  })

  const engagedUsers = dailyUserIds.map((_, i) => {
    const start = Math.max(0, i - 20)
    const week1 = Math.max(0, i - 13)
    const week2 = Math.max(0, i - 6)
    const end = i + 1

    const getTwiceActive = (dailyActiveIds: string[][]) => {
      const userActiveCounts = mapValues(
        groupBy(dailyActiveIds.flat(), (id) => id),
        (ids) => ids.length
      )
      return Object.keys(userActiveCounts).filter(
        (id) => userActiveCounts[id] > 1
      )
    }

    const engaged1 = getTwiceActive(dailyUserIds.slice(start, week1))
    const engaged2 = getTwiceActive(dailyUserIds.slice(week1, week2))
    const engaged3 = getTwiceActive(dailyUserIds.slice(week2, end))
    return intersection(engaged1, engaged2, engaged3).length
  })

  const dailyNewRealUserIds = dailyNewRealUsers.map((users) =>
    users.map((u) => u.id)
  )

  const d1 = dailyUserIds.map((today, i) => {
    if (i === 0) return 0
    if (today.length === 0) return 0

    const yesterday = dailyUserIds[i - 1]

    const retainedCount = sumBy(yesterday, (userId) =>
      today.includes(userId) ? 1 : 0
    )
    return retainedCount / yesterday.length
  })

  const d1WeeklyAvg = d1.map((_, i) => {
    const start = Math.max(0, i - 6)
    const end = i + 1
    return average(d1.slice(start, end))
  })

  const nd1 = dailyUserIds.map((today, i) => {
    if (i === 0) return 0
    if (today.length === 0) return 0

    const yesterday = dailyNewRealUserIds[i - 1]

    const retainedCount = sumBy(yesterday, (userId) =>
      today.includes(userId) ? 1 : 0
    )
    return retainedCount / today.length
  })

  const nd1WeeklyAvg = nd1.map((_, i) => {
    const start = Math.max(0, i - 6)
    const end = i + 1
    return average(nd1.slice(start, end))
  })
  const nw1 = dailyNewRealUserIds.map((_userIds, i) => {
    if (i < 13) return 0

    const twoWeeksAgo = {
      start: Math.max(0, i - 13),
      end: Math.max(0, i - 6),
    }
    const lastWeek = {
      start: Math.max(0, i - 6),
      end: i + 1,
    }
    const newTwoWeeksAgo = new Set<string>(
      dailyNewRealUserIds.slice(twoWeeksAgo.start, twoWeeksAgo.end).flat()
    )
    if (newTwoWeeksAgo.size === 0) return 0
    const activeLastWeek = new Set<string>(
      dailyUserIds.slice(lastWeek.start, lastWeek.end).flat()
    )
    const retainedCount = sumBy(Array.from(newTwoWeeksAgo), (userId) =>
      activeLastWeek.has(userId) ? 1 : 0
    )
    return retainedCount / newTwoWeeksAgo.size
  })

  const weekOnWeekRetention = dailyUserIds.map((_userId, i) => {
    const twoWeeksAgo = {
      start: Math.max(0, i - 13),
      end: Math.max(0, i - 6),
    }
    const lastWeek = {
      start: Math.max(0, i - 6),
      end: i + 1,
    }

    const activeTwoWeeksAgo = new Set<string>(
      dailyUserIds.slice(twoWeeksAgo.start, twoWeeksAgo.end).flat()
    )
    if (activeTwoWeeksAgo.size === 0) return 0
    const activeLastWeek = new Set<string>(
      dailyUserIds.slice(lastWeek.start, lastWeek.end).flat()
    )
    const retainedCount = sumBy(Array.from(activeTwoWeeksAgo), (userId) =>
      activeLastWeek.has(userId) ? 1 : 0
    )
    return retainedCount / activeTwoWeeksAgo.size
  })

  const monthlyRetention = dailyUserIds.map((_userId, i) => {
    const twoMonthsAgo = {
      start: Math.max(0, i - 59),
      end: Math.max(0, i - 29),
    }
    const lastMonth = {
      start: Math.max(0, i - 29),
      end: i + 1,
    }

    const activeTwoMonthsAgo = new Set<string>(
      dailyUserIds.slice(twoMonthsAgo.start, twoMonthsAgo.end).flat()
    )
    if (activeTwoMonthsAgo.size === 0) return 0
    const activeLastMonth = new Set<string>(
      dailyUserIds.slice(lastMonth.start, lastMonth.end).flat()
    )
    const retainedCount = sumBy(Array.from(activeTwoMonthsAgo), (userId) =>
      activeLastMonth.has(userId) ? 1 : 0
    )
    if (activeTwoMonthsAgo.size === 0) return 0
    return retainedCount / activeTwoMonthsAgo.size
  })

  const firstBetDict: { [userId: string]: number } = {}
  for (let i = 0; i < dailyBets.length; i++) {
    const bets = dailyBets[i]
    for (const bet of bets) {
      if (bet.userId in firstBetDict) continue
      firstBetDict[bet.userId] = i
    }
  }
  const dailyActivationRate = dailyNewRealUsers.map((newUsers, i) => {
    if (newUsers.length === 0) return 0
    const activedCount = sumBy(newUsers, (user) => {
      const firstBet = firstBetDict[user.id]
      return firstBet === i ? 1 : 0
    })
    return activedCount / newUsers.length
  })
  const dailyActivationRateWeeklyAvg = dailyActivationRate.map((_, i) => {
    const start = Math.max(0, i - 6)
    const end = i + 1
    return average(dailyActivationRate.slice(start, end))
  })

  const d1BetAverage = dailyNewRealUsers.map((newUsers) => {
    if (newUsers.length === 0) return 0
    return average(newUsers.map((u) => u.d1BetCount))
  })

  const d1Bet3DayAverage = dailyNewRealUsers.map((_, i) => {
    const start = Math.max(0, i - 2)
    const end = i + 1
    const d1BetWindowAverages = dailyNewRealUsers
      .slice(start, end)
      .map((users) => {
        if (users.length === 0) return 0
        return average(users.map((u) => u.d1BetCount))
      })
    return average(d1BetWindowAverages)
  })

  const dailySignups = dailyNewUsers.map((users) => users.length)
  const dailyNewRealUserSignups = dailyNewRealUsers.map((users) => users.length)

  // Total mana divided by 100.
  const manaBetDaily = dailyBets.map((bets) => {
    return Math.round(sumBy(bets, (bet) => bet.amount) / 100)
  })
  const manaBetWeekly = manaBetDaily.map((_, i) => {
    const start = Math.max(0, i - 6)
    const end = i + 1
    const total = sum(manaBetDaily.slice(start, end))
    if (end - start < 7) return (total * 7) / (end - start)
    return total
  })
  const manaBetMonthly = manaBetDaily.map((_, i) => {
    const start = Math.max(0, i - 29)
    const end = i + 1
    const total = sum(manaBetDaily.slice(start, end))
    const range = end - start
    if (range < 30) return (total * 30) / range
    return total
  })

  const statsData: Stats = {
    startDate: [start.valueOf()],
    dailyActiveUsers,
    dailyActiveUsersWeeklyAvg,
    avgDailyUserActions,
    dailySales,
    weeklyActiveUsers,
    monthlyActiveUsers,
    engagedUsers,
    d1,
    d1WeeklyAvg,
    nd1,
    nd1WeeklyAvg,
    nw1,
    dailyBetCounts,
    dailyContractCounts,
    dailyCommentCounts,
    dailySignups,
    weekOnWeekRetention,
    dailyActivationRate,
    dailyActivationRateWeeklyAvg,
    monthlyRetention,
    manaBetDaily,
    manaBetWeekly,
    manaBetMonthly,
    d1BetAverage,
    d1Bet3DayAverage,
    dailyNewRealUserSignups,
  }

  const rows = Object.entries(statsData).map(([title, daily_values]) => ({
    title,
    daily_values,
  }))

  // Write to postgres
  await bulkUpsert(pg, 'stats', 'title', rows)
  await revalidateStaticProps(`/stats`)
  log('Done. Wrote', rows.length, ' rows to stats table')

  await saveCalibrationData(pg)
}
