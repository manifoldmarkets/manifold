import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
dayjs.extend(utc)
dayjs.extend(timezone)

import { range, zip, uniq, sum, sumBy, countBy } from 'lodash'
import { loadPaginated, log, logMemory } from 'shared/utils'
import { Stats } from 'common/stats'
import { DAY_MS } from 'common/util/time'
import { average, median } from 'common/util/math'
import { mapAsync } from 'common/util/promise'
import { User } from 'common/user'
import { Query } from 'firebase-admin/firestore'
import { Contract } from 'common/contract'
import { Comment } from 'common/comment'
import { Bet } from 'common/bet'

const firestore = admin.firestore()

const numberOfDays = 180

interface StatEvent {
  id: string
  userId: string
  ts: number
}

const getBetsQuery = (startTime: number, endTime: number) =>
  firestore
    .collectionGroup('bets')
    .where('createdTime', '>=', startTime)
    .where('createdTime', '<', endTime)
    .orderBy('createdTime', 'asc')
    .select('createdTime', 'userId', 'amount') as Query<Bet>

export async function getDailyBets(startTime: number, numberOfDays: number) {
  const queries = range(0, numberOfDays).map((days) => {
    const begin = startTime + days * DAY_MS
    return getBetsQuery(begin, begin + DAY_MS)
  })

  const betsByDay = await mapAsync(queries, async (q) => {
    return (await loadPaginated(q)).map((b) => ({
      id: b.id,
      userId: b.userId,
      ts: b.createdTime,
      amount: b.amount,
    }))
  })
  return betsByDay
}

const getCommentsQuery = (startTime: number, endTime: number) =>
  firestore
    .collectionGroup('comments')
    .where('createdTime', '>=', startTime)
    .where('createdTime', '<', endTime)
    .orderBy('createdTime', 'asc')
    .select('createdTime', 'userId') as Query<Comment>

export async function getDailyComments(
  startTime: number,
  numberOfDays: number
) {
  const query = getCommentsQuery(startTime, startTime + DAY_MS * numberOfDays)
  const comments = await loadPaginated(query)

  const commentsByDay = range(0, numberOfDays).map(() => [] as StatEvent[])
  for (const comment of comments) {
    const ts = comment.createdTime
    const userId = comment.userId
    const dayIndex = Math.floor((ts - startTime) / DAY_MS)
    commentsByDay[dayIndex].push({ id: comment.id, userId, ts })
  }

  return commentsByDay
}

const getContractsQuery = (startTime: number, endTime: number) =>
  firestore
    .collection('contracts')
    .where('createdTime', '>=', startTime)
    .where('createdTime', '<', endTime)
    .orderBy('createdTime', 'asc')
    .select('createdTime', 'creatorId') as Query<Contract>

export async function getDailyContracts(
  startTime: number,
  numberOfDays: number
) {
  const query = getContractsQuery(startTime, startTime + DAY_MS * numberOfDays)
  const contracts = await loadPaginated(query)

  const contractsByDay = range(0, numberOfDays).map(() => [] as StatEvent[])
  for (const contract of contracts) {
    const ts = contract.createdTime
    const userId = contract.creatorId
    const dayIndex = Math.floor((ts - startTime) / DAY_MS)
    contractsByDay[dayIndex].push({ id: contract.id, userId, ts })
  }

  return contractsByDay
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

const getUsersQuery = (startTime: number, endTime: number) =>
  firestore
    .collection('users')
    .where('createdTime', '>=', startTime)
    .where('createdTime', '<', endTime)
    .orderBy('createdTime', 'asc')
    .select('createdTime') as Query<User>

export async function getDailyNewUsers(
  startTime: number,
  numberOfDays: number
) {
  const query = getUsersQuery(startTime, startTime + DAY_MS * numberOfDays)
  const users = await loadPaginated(query)

  const usersByDay = range(0, numberOfDays).map(() => [] as StatEvent[])
  for (const user of users) {
    const ts = user.createdTime
    const dayIndex = Math.floor((ts - startTime) / DAY_MS)
    usersByDay[dayIndex].push({ id: user.id, userId: user.id, ts })
  }

  return usersByDay
}

export const updateStatsCore = async () => {
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
    getDailyBets(startDate.valueOf(), numberOfDays),
    getDailyContracts(startDate.valueOf(), numberOfDays),
    getDailyComments(startDate.valueOf(), numberOfDays),
    getDailyNewUsers(startDate.valueOf(), numberOfDays),
    getStripeSales(startDate.valueOf(), numberOfDays),
  ])
  logMemory()

  const dailyBetCounts = dailyBets.map((bets) => bets.length)
  const dailyContractCounts = dailyContracts.map(
    (contracts) => contracts.length
  )
  const dailyCommentCounts = dailyComments.map((comments) => comments.length)

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
    )} contracts, ${sum(dailyComments)} comments, from ${sum(
      dailyNewUsers
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
  .runWith({ memory: '8GB', timeoutSeconds: 540 })
  .pubsub.schedule('every 60 minutes')
  .onRun(updateStatsCore)
