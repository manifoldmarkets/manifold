import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { Contract, CPMMContract } from '../../common/contract'
import {
  getAllPrivateUsers,
  getPrivateUser,
  getUser,
  getValue,
  getValues,
  isProd,
  log,
} from './utils'
import { filterDefined } from '../../common/util/array'
import { DAY_MS } from '../../common/util/time'
import { partition, sortBy, sum, uniq } from 'lodash'
import { Bet } from '../../common/bet'
import { computeInvestmentValueCustomProb } from '../../common/calculate-metrics'
import { sendWeeklyPortfolioUpdateEmail } from './emails'
import { contractUrl } from './utils'
import { Txn } from '../../common/txn'
import { formatMoney } from '../../common/util/format'
import { getContractBetMetrics } from '../../common/calculate'

// TODO: reset weeklyPortfolioUpdateEmailSent to false for all users at the start of each week
export const weeklyPortfolioUpdateEmails = functions
  .runWith({ secrets: ['MAILGUN_KEY'], memory: '4GB' })
  // every minute on Friday for an hour at 12pm PT (UTC -07:00)
  .pubsub.schedule('* 19 * * 5')
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
            !user.weeklyPortfolioUpdateEmailSent
        : true
    })
    // Send emails in batches
    .slice(0, 200)
  log(
    'Sending weekly portfolio emails to',
    privateUsersToSendEmailsTo.length,
    'users'
  )

  const usersBets: { [userId: string]: Bet[] } = {}
  // get all bets made by each user
  await Promise.all(
    privateUsersToSendEmailsTo.map(async (user) => {
      return getValues<Bet>(
        firestore.collectionGroup('bets').where('userId', '==', user.id)
      ).then((bets) => {
        usersBets[user.id] = bets
      })
    })
  )

  const usersToContractsCreated: { [userId: string]: Contract[] } = {}
  // Get all contracts created by each user
  await Promise.all(
    privateUsersToSendEmailsTo.map(async (user) => {
      return getValues<Contract>(
        firestore
          .collection('contracts')
          .where('creatorId', '==', user.id)
          .where('createdTime', '>', Date.now() - 7 * DAY_MS)
      ).then((contracts) => {
        usersToContractsCreated[user.id] = contracts
      })
    })
  )

  // Get all txns the users received over the past week
  const usersToTxnsReceived: { [userId: string]: Txn[] } = {}
  await Promise.all(
    privateUsersToSendEmailsTo.map(async (user) => {
      return getValues<Txn>(
        firestore
          .collection(`txns`)
          .where('toId', '==', user.id)
          .where('createdTime', '>', Date.now() - 7 * DAY_MS)
      ).then((txn) => {
        usersToTxnsReceived[user.id] = txn
      })
    })
  )

  // Get a flat map of all the bets that users made to get the contracts they bet on
  const contractsUsersBetOn = filterDefined(
    await Promise.all(
      uniq(
        Object.values(usersBets).flatMap((bets) =>
          bets.map((bet) => bet.contractId)
        )
      ).map((contractId) =>
        getValue<Contract>(firestore.collection('contracts').doc(contractId))
      )
    )
  )
  log('Found', contractsUsersBetOn.length, 'contracts')
  let count = 0
  await Promise.all(
    privateUsersToSendEmailsTo.map(async (privateUser) => {
      const user = await getUser(privateUser.id)
      if (!user) return
      const userBets = usersBets[privateUser.id] as Bet[]
      const contractsUserBetOn = contractsUsersBetOn.filter((contract) =>
        userBets.some((bet) => bet.contractId === contract.id)
      )
      const contractsBetOnInLastWeek = uniq(
        userBets
          .filter((bet) => bet.createdTime > Date.now() - 7 * DAY_MS)
          .map((bet) => bet.contractId)
      )
      const totalTips = sum(
        usersToTxnsReceived[privateUser.id]
          .filter((txn) => txn.category === 'TIP')
          .map((txn) => txn.amount)
      )
      const greenBg = 'rgba(0,160,0,0.2)'
      const redBg = 'rgba(160,0,0,0.2)'
      const clearBg = 'rgba(255,255,255,0)'
      const roundedProfit =
        Math.round(user.profitCached.weekly) === 0
          ? 0
          : Math.floor(user.profitCached.weekly)
      const performanceData = {
        profit: formatMoney(user.profitCached.weekly),
        profit_style: `background-color: ${
          roundedProfit > 0 ? greenBg : roundedProfit === 0 ? clearBg : redBg
        }`,
        markets_created:
          usersToContractsCreated[privateUser.id].length.toString(),
        tips_received: formatMoney(totalTips),
        unique_bettors: usersToTxnsReceived[privateUser.id]
          .filter((txn) => txn.category === 'UNIQUE_BETTOR_BONUS')
          .length.toString(),
        markets_traded: contractsBetOnInLastWeek.length.toString(),
        prediction_streak:
          (user.currentBettingStreak?.toString() ?? '0') + ' days',
        // More options: bonuses, tips given,
      } as OverallPerformanceData

      const investmentValueDifferences = sortBy(
        filterDefined(
          contractsUserBetOn.map((contract) => {
            const cpmmContract = contract as CPMMContract
            if (cpmmContract === undefined || cpmmContract.prob === undefined)
              return
            const bets = userBets.filter(
              (bet) => bet.contractId === contract.id
            )
            const previousBets = bets.filter(
              (b) => b.createdTime < Date.now() - 7 * DAY_MS
            )

            const betsInLastWeek = bets.filter(
              (b) => b.createdTime >= Date.now() - 7 * DAY_MS
            )

            const marketProbabilityAWeekAgo =
              cpmmContract.prob - cpmmContract.probChanges.week
            const currentMarketProbability = cpmmContract.resolutionProbability
              ? cpmmContract.resolutionProbability
              : cpmmContract.prob
            const betsMadeAWeekAgoValue = computeInvestmentValueCustomProb(
              previousBets,
              contract,
              marketProbabilityAWeekAgo
            )
            const currentBetsMadeAWeekAgoValue =
              computeInvestmentValueCustomProb(
                previousBets,
                contract,
                currentMarketProbability
              )
            const betsMadeInLastWeekProfit = getContractBetMetrics(
              contract,
              betsInLastWeek
            ).profit
            const marketChange =
              currentMarketProbability - marketProbabilityAWeekAgo
            return {
              currentValue: currentBetsMadeAWeekAgoValue,
              pastValue: betsMadeAWeekAgoValue,
              difference:
                betsMadeInLastWeekProfit +
                (currentBetsMadeAWeekAgoValue - betsMadeAWeekAgoValue),
              contractSlug: contract.slug,
              marketProbAWeekAgo: marketProbabilityAWeekAgo,
              questionTitle: contract.question,
              questionUrl: contractUrl(contract),
              questionProb: cpmmContract.resolution
                ? cpmmContract.resolution
                : Math.round(cpmmContract.prob * 100) + '%',
              questionChange:
                (marketChange > 0 ? '+' : '') +
                Math.round(marketChange * 100) +
                '%',
              questionChangeStyle: `color: ${
                currentMarketProbability > marketProbabilityAWeekAgo
                  ? 'rgba(0,160,0,1)'
                  : '#a80000'
              };`,
            } as PerContractInvestmentsData
          })
        ),
        (differences) => Math.abs(differences.difference)
      ).reverse()

      log(
        'Found',
        investmentValueDifferences.length,
        'investment differences for user',
        privateUser.id
      )

      const [winningInvestments, losingInvestments] = partition(
        investmentValueDifferences.filter(
          (diff) =>
            diff.pastValue > 0.01 &&
            Math.abs(diff.difference / diff.pastValue) > 0.01 // difference is greater than 1%
        ),
        (investmentsData: PerContractInvestmentsData) => {
          return investmentsData.difference > 0
        }
      )
      // pick 3 winning investments and 3 losing investments
      const topInvestments = winningInvestments.slice(0, 2)
      const worstInvestments = losingInvestments.slice(0, 2)
      // if no bets in the last week ANd no market movers AND no markets created, don't send email
      if (
        contractsBetOnInLastWeek.length === 0 &&
        topInvestments.length === 0 &&
        worstInvestments.length === 0 &&
        usersToContractsCreated[privateUser.id].length === 0
      ) {
        log('No bets in last week, no market movers, no markets created')
        await firestore.collection('private-users').doc(privateUser.id).update({
          weeklyPortfolioUpdateEmailSent: true,
        })
        return
      }
      await sendWeeklyPortfolioUpdateEmail(
        user,
        privateUser,
        topInvestments.concat(worstInvestments) as PerContractInvestmentsData[],
        performanceData
      )
      await firestore.collection('private-users').doc(privateUser.id).update({
        weeklyPortfolioUpdateEmailSent: true,
      })
      log('Sent weekly portfolio update email to', privateUser.email)
      count++
      log('sent out emails to user count:', count)
    })
  )
}

export type PerContractInvestmentsData = {
  questionTitle: string
  questionUrl: string
  questionProb: string
  questionChange: string
  questionChangeStyle: string
  currentValue: number
  pastValue: number
  difference: number
}

export type OverallPerformanceData = {
  profit: string
  prediction_streak: string
  markets_traded: string
  profit_style: string
  tips_received: string
  markets_created: string
  unique_bettors: string
}
