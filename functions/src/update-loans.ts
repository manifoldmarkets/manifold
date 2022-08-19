import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { groupBy, keyBy, sumBy } from 'lodash'
import { getValues, log, payUser, writeAsync } from './utils'
import { Bet } from '../../common/bet'
import { Contract } from '../../common/contract'
import { PortfolioMetrics, User } from '../../common/user'
import { filterDefined } from '../../common/util/array'
import { getUserLoanUpdates } from '../../common/loans'
import { createLoanIncomeNotification } from './create-notification'

const firestore = admin.firestore()

export const updateLoans = functions
  .runWith({ memory: '1GB', timeoutSeconds: 540 })
  // Run every Monday.
  .pubsub.schedule('0 0 * * 1')
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

  const eligibleUsers = filterDefined(
    await Promise.all(
      users.map((user) =>
        isUserEligibleForLoan(user).then((isEligible) =>
          isEligible ? user : undefined
        )
      )
    )
  )
  log(`${eligibleUsers.length} users are eligible for loans.`)

  const contractsById = keyBy(contracts, (contract) => contract.id)
  const betsByUser = groupBy(bets, (bet) => bet.userId)

  const userLoanUpdates = eligibleUsers
    .map(
      (user) =>
        getUserLoanUpdates(betsByUser[user.id] ?? [], contractsById).betUpdates
    )
    .flat()

  log(`${userLoanUpdates.length} bet updates.`)

  const betUpdates = userLoanUpdates.map((update) => ({
    doc: firestore
      .collection('contracts')
      .doc(update.contractId)
      .collection('bets')
      .doc(update.betId),
    fields: {
      loanAmount: update.loanTotal,
    },
  }))

  await writeAsync(firestore, betUpdates)

  const userPayouts = eligibleUsers.map((user) => {
    const updates = userLoanUpdates.filter(
      (update) => update.userId === user.id
    )
    return {
      user,
      payout: sumBy(updates, (update) => update.newLoan),
    }
  })

  log(`${userPayouts.length} user payouts`)

  await Promise.all(
    userPayouts.map(({ user, payout }) => payUser(user.id, payout))
  )

  const today = new Date().toDateString().replace(' ', '-')
  const key = `loan-notifications-${today}`
  await Promise.all(
    userPayouts.map(({ user, payout }) =>
      createLoanIncomeNotification(user, key, payout)
    )
  )

  log('Notifications sent!')
}

const isUserEligibleForLoan = async (user: User) => {
  const [portfolio] = await getValues<PortfolioMetrics>(
    firestore
      .collection(`users/${user.id}/portfolioHistory`)
      .orderBy('timestamp', 'desc')
      .limit(1)
  )
  if (!portfolio) return true

  const { balance, investmentValue } = portfolio
  return balance + investmentValue > 0
}
