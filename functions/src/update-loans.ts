import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { groupBy, keyBy } from 'lodash'
import { getValues, log, payUser, writeAsync } from './utils'
import { Bet } from '../../common/bet'
import { Contract } from '../../common/contract'
import { PortfolioMetrics, User } from '../../common/user'
import { getLoanUpdates } from '../../common/loans'
import { createLoanIncomeNotification } from './create-notification'
import { filterDefined } from '../../common/util/array'

const firestore = admin.firestore()

export const updateLoans = functions
  .runWith({ memory: '8GB', timeoutSeconds: 540 })
  // Run every day at midnight.
  .pubsub.schedule('0 0 * * *')
  .timeZone('America/Los_Angeles')
  .onRun(updateLoansCore)

async function updateLoansCore() {
  log('Updating loans...')

  const [users, contracts, bets] = await Promise.all([
    getValues<User>(firestore.collection('users')),
    getValues<Contract>(
      firestore.collection('contracts').where('isResolved', '==', false)
    ),
    getValues<Bet>(firestore.collectionGroup('bets')),
  ])
  log(
    `Loaded ${users.length} users, ${contracts.length} contracts, and ${bets.length} bets.`
  )
  const userPortfolios = filterDefined(
    await Promise.all(
      users.map(async (user) => {
        const portfolio = await getValues<PortfolioMetrics>(
          firestore
            .collection(`users/${user.id}/portfolioHistory`)
            .orderBy('timestamp', 'desc')
            .limit(1)
        )
        return portfolio[0]
      })
    )
  )
  log(`Loaded ${userPortfolios.length} portfolios`)
  const portfolioByUser = keyBy(userPortfolios, (portfolio) => portfolio.userId)

  const contractsById = Object.fromEntries(
    contracts.map((contract) => [contract.id, contract])
  )
  const betsByUser = groupBy(bets, (bet) => bet.userId)
  const { betUpdates, userPayouts } = getLoanUpdates(
    users,
    contractsById,
    portfolioByUser,
    betsByUser
  )

  log(`${betUpdates.length} bet updates.`)

  const betDocUpdates = betUpdates.map((update) => ({
    doc: firestore
      .collection('contracts')
      .doc(update.contractId)
      .collection('bets')
      .doc(update.betId),
    fields: {
      loanAmount: update.loanTotal,
    },
  }))

  await writeAsync(firestore, betDocUpdates)

  log(`${userPayouts.length} user payouts`)

  await Promise.all(
    userPayouts.map(({ user, payout }) => payUser(user.id, payout))
  )

  const today = new Date().toDateString().replace(' ', '-')
  const key = `loan-notifications-${today}`
  await Promise.all(
    userPayouts
      // Don't send a notification if the payout is < M$1,
      // because a M$0 loan is confusing.
      .filter(({ payout }) => payout >= 1)
      .map(({ user, payout }) =>
        createLoanIncomeNotification(user, key, payout)
      )
  )

  log('Notifications sent!')
}
