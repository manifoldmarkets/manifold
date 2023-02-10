import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { Contract, CPMMContract } from 'common/contract'
import {
  getAllPrivateUsers,
  getPrivateUser,
  getUser,
  getValue,
  getValues,
  isProd,
  log,
} from 'shared/utils'
import { filterDefined } from 'common/util/array'
import { DAY_MS } from 'common/util/time'
import { partition, sortBy, uniq, uniqBy } from 'lodash'
import { Bet } from 'common/bet'
import { emailMoneyFormat, sendWeeklyPortfolioUpdateEmail } from './emails'
import { contractUrl } from 'shared/utils'
import { Txn } from 'common/txn'
import { Reaction, ReactionTypes } from 'common/reaction'
import { ContractMetric } from 'common/contract-metric'

const USERS_TO_EMAIL = 600
const WEEKLY_MOVERS_TO_SEND = 6
// This should(?) work until we have ~70k users (500 * 120)
export const weeklyPortfolioUpdateEmails = functions
  .runWith({ secrets: ['MAILGUN_KEY'], memory: '4GB', timeoutSeconds: 540 })
  // every minute on Friday for two hours at 12pm PT (UTC -07:00)
  .pubsub.schedule('* 19-20 * * 5')
  .timeZone('Etc/UTC')
  .onRun(async () => {
    await sendPortfolioUpdateEmailsToAllUsers()
  })

const firestore = admin.firestore()

export async function sendPortfolioUpdateEmailsToAllUsers() {
  const privateUsers = isProd()
    ? // ian & stephen's ids
      // filterDefined([
      // await getPrivateUser('AJwLWoo3xue32XIiAVrL5SyR1WB2'),
      // await getPrivateUser('tlmGNz9kjXc2EteizMORes4qvWl2'),
      // ])
      await getAllPrivateUsers()
    : filterDefined([await getPrivateUser('6hHpzvRG0pMq8PNJs7RZj2qlZGn2')])
  // get all users that haven't unsubscribed from weekly emails
  const privateUsersToSendEmailsTo = privateUsers
    .filter((user) => {
      return isProd()
        ? user.notificationPreferences.profit_loss_updates.includes('email') &&
            !user.notificationPreferences.opt_out_all.includes('email') &&
            !user.weeklyPortfolioUpdateEmailSent &&
            user.email
        : user.notificationPreferences.profit_loss_updates.includes('email')
    })
    // Send emails in batches
    .slice(0, USERS_TO_EMAIL)

  if (privateUsersToSendEmailsTo.length === 0) {
    log('No users to send trending markets emails to')
    return
  }

  log(
    'Sending weekly portfolio emails to',
    privateUsersToSendEmailsTo.length,
    'users'
  )

  await Promise.all(
    privateUsersToSendEmailsTo.map(async (privateUser) => {
      await firestore.collection('private-users').doc(privateUser.id).update({
        weeklyPortfolioUpdateEmailSent: true,
      })
    })
  )

  // Get all bets made by each user
  const usersToBetsInLastWeek: { [userId: string]: Bet[] } = {}
  await Promise.all(
    privateUsersToSendEmailsTo.map(async (user) => {
      usersToBetsInLastWeek[user.id] = await getValues<Bet>(
        firestore
          .collectionGroup('bets')
          .where('userId', '==', user.id)
          .where('createdTime', '>=', Date.now() - 7 * DAY_MS)
      )
    })
  )

  // Get all contracts created by each user
  const usersToContractsCreated: { [userId: string]: Contract[] } = {}
  await Promise.all(
    privateUsersToSendEmailsTo.map(async (user) => {
      usersToContractsCreated[user.id] = await getValues<Contract>(
        firestore
          .collection('contracts')
          .where('creatorId', '==', user.id)
          .where('createdTime', '>', Date.now() - 7 * DAY_MS)
      )
    })
  )

  // Get all txns the users received over the past week
  const usersToTxnsReceived: { [userId: string]: Txn[] } = {}
  await Promise.all(
    privateUsersToSendEmailsTo.map(async (user) => {
      usersToTxnsReceived[user.id] = await getValues<Txn>(
        firestore
          .collection(`txns`)
          .where('toId', '==', user.id)
          .where('createdTime', '>', Date.now() - 7 * DAY_MS)
      )
    })
  )

  // Get all likes the users received over the past week
  const usersToLikesReceived: { [userId: string]: Reaction[] } = {}
  await Promise.all(
    privateUsersToSendEmailsTo.map(async (user) => {
      usersToLikesReceived[user.id] = await getValues<Reaction>(
        firestore
          .collectionGroup(`reactions`)
          .where('contentOwnerId', '==', user.id)
          .where('type', '==', 'like' as ReactionTypes)
          .where('createdTime', '>', Date.now() - 7 * DAY_MS)
      )
    })
  )

  // Get all contract metrics for each user
  const usersToContractMetrics: { [userId: string]: ContractMetric[] } = {}
  await Promise.all(
    privateUsersToSendEmailsTo.map(async (user) => {
      const topProfits = await getValues<ContractMetric>(
        firestore
          .collection(`users/${user.id}/contract-metrics`)
          .orderBy('from.week.profit', 'desc')
          .limit(Math.round(WEEKLY_MOVERS_TO_SEND / 2))
      )
      const topLosses = await getValues<ContractMetric>(
        firestore
          .collection(`users/${user.id}/contract-metrics`)
          .orderBy('from.week.profit', 'asc')
          .limit(Math.round(WEEKLY_MOVERS_TO_SEND / 2))
      )
      usersToContractMetrics[user.id] = uniqBy(
        [...topProfits, ...topLosses],
        (cm) => cm.contractId
      )
    })
  )

  // Get a flat map of all the contracts that users have metrics for
  const allWeeklyMoversContracts = filterDefined(
    await Promise.all(
      uniq(
        Object.values(usersToContractMetrics).flatMap((cms) =>
          cms.map((cm) => cm.contractId)
        )
      ).map((contractId) =>
        getValue<Contract>(firestore.collection('contracts').doc(contractId))
      )
    )
  )

  let sent = 0
  await Promise.all(
    privateUsersToSendEmailsTo.map(async (privateUser) => {
      const user = await getUser(privateUser.id)
      // Don't send to a user unless they're over 5 days old
      if (!user || user.createdTime > Date.now() - 5 * DAY_MS) return

      // Compute fun auxiliary stats
      const totalContractsUserBetOnInLastWeek = uniq(
        usersToBetsInLastWeek[privateUser.id].map((bet) => bet.contractId)
      ).length
      const greenBg = 'rgba(0,160,0,0.2)'
      const redBg = 'rgba(160,0,0,0.2)'
      const clearBg = 'rgba(255,255,255,0)'
      const roundedProfit =
        Math.round(user.profitCached.weekly) === 0
          ? 0
          : Math.floor(user.profitCached.weekly)

      const performanceData = {
        profit: emailMoneyFormat(user.profitCached.weekly),
        profit_style: `background-color: ${
          roundedProfit > 0 ? greenBg : roundedProfit === 0 ? clearBg : redBg
        }`,
        markets_created:
          usersToContractsCreated[privateUser.id].length.toString(),
        likes_received: usersToLikesReceived[privateUser.id].length.toString(),
        unique_bettors: usersToTxnsReceived[privateUser.id]
          .filter((txn) => txn.category === 'UNIQUE_BETTOR_BONUS')
          .length.toString(),
        markets_traded: totalContractsUserBetOnInLastWeek.toString(),
        prediction_streak:
          (user.currentBettingStreak?.toString() ?? '0') + ' days',
        // More options: bonuses, tips given,
      } as OverallPerformanceData

      const weeklyMoverContracts = filterDefined(
        usersToContractMetrics[user.id]
          .map((cm) => cm.contractId)
          .map((contractId) =>
            allWeeklyMoversContracts.find((c) => c.id === contractId)
          )
      )

      // Compute weekly movers stats
      const investmentValueDifferences = sortBy(
        filterDefined(
          weeklyMoverContracts.map((contract) => {
            const cpmmContract = contract as CPMMContract
            const marketProbAWeekAgo =
              cpmmContract.prob - cpmmContract.probChanges.week

            const cm = usersToContractMetrics[user.id].filter(
              (cm) => cm.contractId === contract.id
            )[0]
            if (!cm || !cm.from) return undefined
            const fromWeek = cm.from.week
            const profit = fromWeek.profit
            const currentValue = cm.payout

            return {
              currentValue,
              pastValue: fromWeek.prevValue,
              profit,
              contractSlug: contract.slug,
              marketProbAWeekAgo,
              questionTitle: contract.question,
              questionUrl: contractUrl(contract),
              questionProb: cpmmContract.resolution
                ? cpmmContract.resolution
                : Math.round(cpmmContract.prob * 100) + '%',
              profitStyle: `color: ${
                profit > 0 ? 'rgba(0,160,0,1)' : '#a80000'
              };`,
            } as PerContractInvestmentsData
          })
        ),
        (differences) => Math.abs(differences.profit)
      ).reverse()

      // Don't show markets with abs profit < 1
      const [winningInvestments, losingInvestments] = partition(
        investmentValueDifferences.filter((diff) => Math.abs(diff.profit) > 1),
        (investmentsData: PerContractInvestmentsData) => {
          return investmentsData.profit > 0
        }
      )
      // Pick 3 winning investments and 3 losing investments
      const topInvestments = winningInvestments.slice(0, 3)
      const worstInvestments = losingInvestments.slice(0, 3)
      // If no bets in the last week ANd no market movers AND no markets created, don't send email
      if (
        totalContractsUserBetOnInLastWeek === 0 &&
        topInvestments.length === 0 &&
        worstInvestments.length === 0 &&
        usersToContractsCreated[privateUser.id].length === 0
      ) {
        return
      }
      await sendWeeklyPortfolioUpdateEmail(
        user,
        privateUser,
        topInvestments.concat(worstInvestments) as PerContractInvestmentsData[],
        performanceData,
        WEEKLY_MOVERS_TO_SEND
      )
      sent++
      log(`emails sent: ${sent}/${USERS_TO_EMAIL}`)
    })
  )
}

export type PerContractInvestmentsData = {
  questionTitle: string
  questionUrl: string
  questionProb: string
  profitStyle: string
  currentValue: number
  pastValue: number
  profit: number
}

export type OverallPerformanceData = {
  profit: string
  prediction_streak: string
  markets_traded: string
  profit_style: string
  likes_received: string
  markets_created: string
  unique_bettors: string
}
