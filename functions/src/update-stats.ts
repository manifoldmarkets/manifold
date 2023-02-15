import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { concat, countBy, sortBy, range, zip, uniq, sum, sumBy } from 'lodash'
import { getValues, log, logMemory } from './utils'
import { Bet } from '../../common/bet'
import { Contract } from '../../common/contract'
import { Comment } from '../../common/comment'
import { User } from '../../common/user'
import { DAY_MS } from '../../common/util/time'
import { average } from '../../common/util/math'

const firestore = admin.firestore()

const getBetsQuery = (startTime: number, endTime: number) =>
  firestore
    .collectionGroup('bets')
    .where('createdTime', '>=', startTime)
    .where('createdTime', '<', endTime)
    .orderBy('createdTime', 'asc')

export async function getDailyBets(startTime: number, numberOfDays: number) {
  const query = getBetsQuery(startTime, startTime + DAY_MS * numberOfDays)
  const bets = await getValues<Bet>(query)

  const betsByDay = range(0, numberOfDays).map(() => [] as Bet[])
  for (const bet of bets) {
    const dayIndex = Math.floor((bet.createdTime - startTime) / DAY_MS)
    betsByDay[dayIndex].push(bet)
  }

  return betsByDay
}

const getCommentsQuery = (startTime: number, endTime: number) =>
  firestore
    .collectionGroup('comments')
    .where('createdTime', '>=', startTime)
    .where('createdTime', '<', endTime)
    .orderBy('createdTime', 'asc')

export async function getDailyComments(
  startTime: number,
  numberOfDays: number
) {
  const query = getCommentsQuery(startTime, startTime + DAY_MS * numberOfDays)
  const comments = await getValues<Comment>(query)

  const commentsByDay = range(0, numberOfDays).map(() => [] as Comment[])
  for (const comment of comments) {
    const dayIndex = Math.floor((comment.createdTime - startTime) / DAY_MS)
    commentsByDay[dayIndex].push(comment)
  }

  return commentsByDay
}

const getContractsQuery = (startTime: number, endTime: number) =>
  firestore
    .collection('contracts')
    .where('createdTime', '>=', startTime)
    .where('createdTime', '<', endTime)
    .orderBy('createdTime', 'asc')

export async function getDailyContracts(
  startTime: number,
  numberOfDays: number
) {
  const query = getContractsQuery(startTime, startTime + DAY_MS * numberOfDays)
  const contracts = await getValues<Contract>(query)

  const contractsByDay = range(0, numberOfDays).map(() => [] as Contract[])
  for (const contract of contracts) {
    const dayIndex = Math.floor((contract.createdTime - startTime) / DAY_MS)
    contractsByDay[dayIndex].push(contract)
  }

  return contractsByDay
}

const getUsersQuery = (startTime: number, endTime: number) =>
  firestore
    .collection('users')
    .where('createdTime', '>=', startTime)
    .where('createdTime', '<', endTime)
    .orderBy('createdTime', 'asc')

export async function getDailyNewUsers(
  startTime: number,
  numberOfDays: number
) {
  const query = getUsersQuery(startTime, startTime + DAY_MS * numberOfDays)
  const users = await getValues<User>(query)

  const usersByDay = range(0, numberOfDays).map(() => [] as User[])
  for (const user of users) {
    const dayIndex = Math.floor((user.createdTime - startTime) / DAY_MS)
    usersByDay[dayIndex].push(user)
  }

  return usersByDay
}

export const updateStatsCore = async () => {
  const startDate = new Date('2022-08-07').getTime()
  const today = Date.now()
  const numberOfDays = Math.floor((today - startDate) / DAY_MS)

  log('Fetching data for stats update...')
  const [dailyBets, dailyContracts, dailyComments, dailyNewUsers] =
    await Promise.all([
      getDailyBets(startDate.valueOf(), numberOfDays),
      getDailyContracts(startDate.valueOf(), numberOfDays),
      getDailyComments(startDate.valueOf(), numberOfDays),
      getDailyNewUsers(startDate.valueOf(), numberOfDays),
    ])
  logMemory()

  const dailyBetCounts = dailyBets.map((bets) => bets.length)
  const dailyContractCounts = dailyContracts.map(
    (contracts) => contracts.length
  )
  const dailyCommentCounts = dailyComments.map((comments) => comments.length)

  const dailyUserIds = zip(dailyContracts, dailyBets, dailyComments).map(
    ([contracts, bets, comments]) => {
      const creatorIds = (contracts ?? []).map((c) => c.creatorId)
      const betUserIds = (bets ?? []).map((bet) => bet.userId)
      const commentUserIds = (comments ?? []).map((comment) => comment.userId)
      return uniq([...creatorIds, ...betUserIds, ...commentUserIds])
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

  const weeklyActiveUsers = dailyUserIds.map((_, i) => {
    const start = Math.max(0, i - 6)
    const end = i
    const uniques = new Set<string>()
    for (let j = start; j <= end; j++)
      dailyUserIds[j].forEach((userId) => uniques.add(userId))
    return uniques.size
  })

  const monthlyActiveUsers = dailyUserIds.map((_, i) => {
    const start = Math.max(0, i - 29)
    const end = i
    const uniques = new Set<string>()
    for (let j = start; j <= end; j++)
      dailyUserIds[j].forEach((userId) => uniques.add(userId))
    return uniques.size
  })

  const weekOnWeekRetention = dailyUserIds.map((_userId, i) => {
    const twoWeeksAgo = {
      start: Math.max(0, i - 13),
      end: Math.max(0, i - 7),
    }
    const lastWeek = {
      start: Math.max(0, i - 6),
      end: i,
    }

    const activeTwoWeeksAgo = new Set<string>()
    for (let j = twoWeeksAgo.start; j <= twoWeeksAgo.end; j++) {
      dailyUserIds[j].forEach((userId) => activeTwoWeeksAgo.add(userId))
    }
    const activeLastWeek = new Set<string>()
    for (let j = lastWeek.start; j <= lastWeek.end; j++) {
      dailyUserIds[j].forEach((userId) => activeLastWeek.add(userId))
    }
    const retainedCount = sumBy(Array.from(activeTwoWeeksAgo), (userId) =>
      activeLastWeek.has(userId) ? 1 : 0
    )
    const retainedFrac = retainedCount / activeTwoWeeksAgo.size
    return Math.round(retainedFrac * 100 * 100) / 100
  })

  const monthlyRetention = dailyUserIds.map((_userId, i) => {
    const twoMonthsAgo = {
      start: Math.max(0, i - 60),
      end: Math.max(0, i - 30),
    }
    const lastMonth = {
      start: Math.max(0, i - 30),
      end: i,
    }

    const activeTwoMonthsAgo = new Set<string>()
    for (let j = twoMonthsAgo.start; j <= twoMonthsAgo.end; j++) {
      dailyUserIds[j].forEach((userId) => activeTwoMonthsAgo.add(userId))
    }
    const activeLastMonth = new Set<string>()
    for (let j = lastMonth.start; j <= lastMonth.end; j++) {
      dailyUserIds[j].forEach((userId) => activeLastMonth.add(userId))
    }
    const retainedCount = sumBy(Array.from(activeTwoMonthsAgo), (userId) =>
      activeLastMonth.has(userId) ? 1 : 0
    )
    const retainedFrac = retainedCount / activeTwoMonthsAgo.size
    return Math.round(retainedFrac * 100 * 100) / 100
  })

  const firstBetDict: { [userId: string]: number } = {}
  for (let i = 0; i < dailyBets.length; i++) {
    const bets = dailyBets[i]
    for (const bet of bets) {
      if (bet.userId in firstBetDict) continue
      firstBetDict[bet.userId] = i
    }
  }
  const weeklyActivationRate = dailyNewUsers.map((_, i) => {
    const start = Math.max(0, i - 6)
    const end = i
    let activatedCount = 0
    let newUsers = 0
    for (let j = start; j <= end; j++) {
      const userIds = dailyNewUsers[j].map((user) => user.id)
      newUsers += userIds.length
      for (const userId of userIds) {
        const dayIndex = firstBetDict[userId]
        if (dayIndex !== undefined && dayIndex <= end) {
          activatedCount++
        }
      }
    }
    const frac = activatedCount / (newUsers || 1)
    return Math.round(frac * 100 * 100) / 100
  })
  const dailySignups = dailyNewUsers.map((users) => users.length)

  const dailyTopTenthActions = zip(
    dailyContracts,
    dailyBets,
    dailyComments
  ).map(([contracts, bets, comments]) => {
    const userIds = concat(
      contracts?.map((c) => c.creatorId) ?? [],
      bets?.map((b) => b.userId) ?? [],
      comments?.map((c) => c.userId) ?? []
    )
    const counts = Object.values(countBy(userIds))
    const sortedCounts = sortBy(counts, (count) => count).reverse()
    if (sortedCounts.length === 0) return 0
    const tenthPercentile = sortedCounts[Math.floor(sortedCounts.length * 0.1)]
    return tenthPercentile
  })
  const weeklyTopTenthActions = dailyTopTenthActions.map((_, i) => {
    const start = Math.max(0, i - 6)
    const end = i
    return average(dailyTopTenthActions.slice(start, end))
  })
  const monthlyTopTenthActions = dailyTopTenthActions.map((_, i) => {
    const start = Math.max(0, i - 29)
    const end = i
    return average(dailyTopTenthActions.slice(start, end))
  })

  // Total mana divided by 100.
  const dailyManaBet = dailyBets.map((bets) => {
    return Math.round(sumBy(bets, (bet) => bet.amount) / 100)
  })
  const weeklyManaBet = dailyManaBet.map((_, i) => {
    const start = Math.max(0, i - 6)
    const end = i
    const total = sum(dailyManaBet.slice(start, end))
    if (end - start < 7) return (total * 7) / (end - start)
    return total
  })
  const monthlyManaBet = dailyManaBet.map((_, i) => {
    const start = Math.max(0, i - 29)
    const end = i
    const total = sum(dailyManaBet.slice(start, end))
    const range = end - start + 1
    if (range < 30) return (total * 30) / range
    return total
  })

  const statsData = {
    startDate: startDate.valueOf(),
    dailyActiveUsers,
    weeklyActiveUsers,
    monthlyActiveUsers,
    dailyBetCounts,
    dailyContractCounts,
    dailyCommentCounts,
    dailySignups,
    weekOnWeekRetention,
    weeklyActivationRate,
    monthlyRetention,
    topTenthActions: {
      daily: dailyTopTenthActions,
      weekly: weeklyTopTenthActions,
      monthly: monthlyTopTenthActions,
    },
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
  .runWith({ memory: '1GB', timeoutSeconds: 540 })
  .pubsub.schedule('every 12 hours')
  .onRun(updateStatsCore)
