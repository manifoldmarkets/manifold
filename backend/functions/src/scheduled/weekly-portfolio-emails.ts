import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { CPMMBinaryContract, CPMMContract } from 'common/contract'
import {
  getAllPrivateUsers,
  getPrivateUser,
  getUser,
  getValues,
  isProd,
  log,
} from 'shared/utils'
import { filterDefined } from 'common/util/array'
import { DAY_MS } from 'common/util/time'
import { partition, sortBy, sum, uniq, uniqBy } from 'lodash'
import {
  PerContractInvestmentsData,
  OverallPerformanceData,
  emailMoneyFormat,
  sendWeeklyPortfolioUpdateEmail,
} from 'shared/emails'
import { contractUrl } from 'shared/utils'
import { Txn } from 'common/txn'
import { Reaction, ReactionTypes } from 'common/reaction'
import {
  getUsersRecentBetContractIds,
  getUsersContractMetricsOrderedByProfit,
} from 'common/supabase/contract-metrics'
import { createSupabaseClient } from 'shared/supabase/init'
import { getContracts, getContractsByUsers } from 'common/supabase/contracts'
import { secrets } from 'functions/secrets'

const USERS_TO_EMAIL = 600
const WEEKLY_MOVERS_TO_SEND = 6
// This should(?) work until we have ~70k users (500 * 120)
export const weeklyPortfolioUpdateEmails = functions
  .runWith({
    secrets,
    memory: '4GB',
    timeoutSeconds: 540,
  })
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
  const db = createSupabaseClient()

  const userIds = privateUsersToSendEmailsTo.map((user) => user.id)
  // Get all contracts created by each user
  const usersToContractsCreated = await getContractsByUsers(
    userIds,
    db,
    Date.now() - 7 * DAY_MS
  )

  const contractIdsBetOnInLastWeek = await getUsersRecentBetContractIds(
    userIds,
    db,
    Date.now() - 7 * DAY_MS
  )

  // Get all txns the users received over the past week
  const usersToTxnsReceived: { [userId: string]: Txn[] } = {}
  await Promise.all(
    userIds.map(async (id) => {
      usersToTxnsReceived[id] = await getValues<Txn>(
        firestore
          .collection(`txns`)
          .where('toId', '==', id)
          .where('createdTime', '>', Date.now() - 7 * DAY_MS)
      )
    })
  )

  // Get all likes the users received over the past week
  const usersToLikesReceived: { [userId: string]: Reaction[] } = {}
  await Promise.all(
    userIds.map(async (id) => {
      usersToLikesReceived[id] = await getValues<Reaction>(
        firestore
          .collectionGroup(`reactions`)
          .where('contentOwnerId', '==', id)
          .where('type', '==', 'like' as ReactionTypes)
          .where('createdTime', '>', Date.now() - 7 * DAY_MS)
      )
    })
  )
  // TODO: use their saved weekly portfolio update object from weekly-portfolio-updates.ts
  const usersToContractMetrics = await getUsersContractMetricsOrderedByProfit(
    userIds,
    db,
    'week'
  )
  const allWeeklyMoversContracts = (await getContracts(
    uniq(
      Object.values(usersToContractMetrics).flatMap((cms) =>
        cms.map((cm) => cm.contractId)
      )
    ),
    db
  )) as CPMMBinaryContract[]

  let sent = 0
  await Promise.all(
    privateUsersToSendEmailsTo.map(async (privateUser) => {
      const user = await getUser(privateUser.id)
      // Don't send to a user unless they're over 5 days old
      if (!user || user.createdTime > Date.now() - 5 * DAY_MS) return

      // Compute fun auxiliary stats
      const totalContractsUserBetOnInLastWeek = uniqBy(
        contractIdsBetOnInLastWeek[privateUser.id],
        (cm) => cm.contractId
      ).length
      const greenBg = 'rgba(0,160,0,0.2)'
      const redBg = 'rgba(160,0,0,0.2)'
      const clearBg = 'rgba(255,255,255,0)'
      const usersMetrics = usersToContractMetrics[privateUser.id]
      const profit = sum(usersMetrics.map((cm) => cm.from?.week.profit ?? 0))
      const roundedProfit = Math.round(profit) === 0 ? 0 : Math.floor(profit)
      const marketsCreated = (usersToContractsCreated?.[privateUser.id] ?? [])
        .length
      const performanceData = {
        profit: emailMoneyFormat(profit),
        profit_style: `background-color: ${
          roundedProfit > 0 ? greenBg : roundedProfit === 0 ? clearBg : redBg
        }`,
        markets_created: marketsCreated.toString(),
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
        marketsCreated === 0
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
