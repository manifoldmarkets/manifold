import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
dayjs.extend(utc)
dayjs.extend(timezone)

import { range, zip, uniq, sum, sumBy, countBy } from 'lodash'
import { log, logMemory } from 'shared/utils'
import { Stats } from 'common/stats'
import { DAY_MS } from 'common/util/time'
import { average, median } from 'common/util/math'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { secrets } from 'functions/secrets'

const firestore = admin.firestore()

const numberOfDays = 180

interface StatEvent {
  id: string
  userId: string
  ts: number
}
type StatBet = StatEvent & { amount: number }

async function getDailyBets(
  pg: SupabaseDirectClient,
  startTime: number,
  numberOfDays: number
) {
  const bets = await pg.manyOrNone(
    `select
      extract(day from millis_interval((data->'createdTime')::bigint, $2)) as day,
      (data->'createdTime')::bigint as ts,
      data->>'userId' as user_id,
      data->>'amount' as amount,
      bet_id
    from contract_bets
    where to_jsonb(data)->>'createdTime' >= $1::text and to_jsonb(data)->>'createdTime' < $2::text`,
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
    `select
      extract(day from millis_interval((data->'createdTime')::bigint, $2)) as day,
      (data->'createdTime')::bigint as ts,
      data->>'creatorId' as user_id,
      id
    from contracts
    where (data->'createdTime')::bigint >= $1 and (data->'createdTime')::bigint < $2`,
    [startTime, startTime + numberOfDays * DAY_MS]
  )
  const contractsByDay: StatEvent[][] = range(0, numberOfDays).map((_) => [])
  for (const r of contracts) {
    contractsByDay[(numberOfDays - 1 - r.day) as number].push({
      id: r.id as string,
      userId: r.user_id as string,
      ts: r.ts as number,
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
      extract(day from millis_interval((data->'createdTime')::bigint, $2)) as day,
      (data->'createdTime')::bigint as ts,
      id
    from users
    where (data->'createdTime')::bigint >= $1 and (data->'createdTime')::bigint < $2`,
    [startTime, startTime + numberOfDays * DAY_MS]
  )
  const usersByDay: StatEvent[][] = range(0, numberOfDays).map((_) => [])
  for (const r of users) {
    usersByDay[(numberOfDays - 1 - r.day) as number].push({
      id: r.id as string,
      userId: r.id as string,
      ts: r.ts as number,
    } as const)
  }
  return usersByDay
}

const getStripeSalesQuery = (startTime: number, endTime: number) =>
  firestore
    .collection('stripe-transactions')
    .where('timestamp', '>=', startTime)
    .where('timestamp', '<', endTime)
    .orderBy('timestamp', 'asc')
    .select('manticDollarQuantity', 'timestamp', 'userId', 'sessionId')

export async function getStripeSales(startTime: number, numberOfDays: number) {
  const query = getStripeSalesQuery(
    startTime,
    startTime + DAY_MS * numberOfDays
  )
  const sales = (await query.get()).docs

  const salesByDay = range(0, numberOfDays).map(() => [] as any[])
  for (const sale of sales) {
    const ts = sale.get('timestamp')
    const amount = sale.get('manticDollarQuantity') / 100 // convert to dollars
    const userId = sale.get('userId')
    const sessionId = sale.get('sessionId')
    const dayIndex = Math.floor((ts - startTime) / DAY_MS)
    salesByDay[dayIndex].push({ id: sessionId, userId, ts, amount })
  }

  return salesByDay
}

export const updateStatsCore = async () => {
  const pg = createSupabaseDirectClient()
  const today = dayjs().tz('America/Los_Angeles').startOf('day').valueOf()
  const startDate = today - numberOfDays * DAY_MS

  log('Fetching data for stats update...')
  const [
    dailyBets,
    dailyContracts,
    dailyComments,
    dailyNewUsers,
    dailyStripeSales,
  ] = await Promise.all([
    getDailyBets(pg, startDate.valueOf(), numberOfDays),
    getDailyContracts(pg, startDate.valueOf(), numberOfDays),
    getDailyComments(pg, startDate.valueOf(), numberOfDays),
    getDailyNewUsers(pg, startDate.valueOf(), numberOfDays),
    getStripeSales(startDate.valueOf(), numberOfDays),
  ])
  logMemory()

  const dailyBetCounts = dailyBets.map((bets) => bets.length)

  const dailyContractCounts = dailyContracts.map(
    (contracts) => contracts.length
  )
  const dailyCommentCounts = dailyComments.map((comments) => comments.length)
  const dailyNewUserCounts = dailyNewUsers.map((users) => users.length)

  const dailySales = dailyStripeSales.map((sales) =>
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
      return median(Object.values(userIdCounts).filter((c) => c > 1))
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

  const d1 = dailyUserIds.map((userIds, i) => {
    if (i === 0) return 0

    const uniques = new Set(userIds)
    const yesterday = dailyUserIds[i - 1]

    const retainedCount = sumBy(yesterday, (userId) =>
      uniques.has(userId) ? 1 : 0
    )
    return retainedCount / uniques.size
  })

  const d1WeeklyAvg = d1.map((_, i) => {
    const start = Math.max(0, i - 6)
    const end = i + 1
    return average(d1.slice(start, end))
  })

  const dailyNewUserIds = dailyNewUsers.map((users) => users.map((u) => u.id))
  const nd1 = dailyUserIds.map((userIds, i) => {
    if (i === 0) return 0

    const uniques = new Set(userIds)
    const yesterday = dailyNewUserIds[i - 1]

    const retainedCount = sumBy(yesterday, (userId) =>
      uniques.has(userId) ? 1 : 0
    )
    return retainedCount / uniques.size
  })

  const nd1WeeklyAvg = nd1.map((_, i) => {
    const start = Math.max(0, i - 6)
    const end = i + 1
    return average(nd1.slice(start, end))
  })
  const nw1 = dailyNewUserIds.map((_userIds, i) => {
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
      dailyNewUserIds.slice(twoWeeksAgo.start, twoWeeksAgo.end).flat()
    )
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
  const dailyActivationRate = dailyNewUsers.map((newUsers, i) => {
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

  const dailySignups = dailyNewUsers.map((users) => users.length)

  // Total mana divided by 100.
  const dailyManaBet = dailyBets.map((bets) => {
    return Math.round(sumBy(bets, (bet) => bet.amount) / 100)
  })
  const weeklyManaBet = dailyManaBet.map((_, i) => {
    const start = Math.max(0, i - 6)
    const end = i + 1
    const total = sum(dailyManaBet.slice(start, end))
    if (end - start < 7) return (total * 7) / (end - start)
    return total
  })
  const monthlyManaBet = dailyManaBet.map((_, i) => {
    const start = Math.max(0, i - 29)
    const end = i + 1
    const total = sum(dailyManaBet.slice(start, end))
    const range = end - start
    if (range < 30) return (total * 30) / range
    return total
  })

  const statsData: Stats = {
    startDate: startDate.valueOf(),
    dailyActiveUsers,
    dailyActiveUsersWeeklyAvg,
    avgDailyUserActions,
    dailySales,
    weeklyActiveUsers,
    monthlyActiveUsers,
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
    manaBet: {
      daily: dailyManaBet,
      weekly: weeklyManaBet,
      monthly: monthlyManaBet,
    },
  }

  log('Computed stats: ', statsData)
  await firestore.doc('stats/stats').set(statsData)
}

export const updateStats = functions
  .runWith({
    memory: '2GB',
    timeoutSeconds: 540,
    secrets,
  })
  .pubsub.schedule('every 60 minutes')
  .onRun(updateStatsCore)
