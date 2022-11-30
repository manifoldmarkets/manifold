import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { groupBy, keyBy, sortBy } from 'lodash'
import { getValues, invokeFunction, log, payUser, writeAsync } from './utils'
import { Bet } from '../../common/bet'
import { Contract } from '../../common/contract'
import { PortfolioMetrics, User } from '../../common/user'
import { getUserLoanUpdates, isUserEligibleForLoan } from '../../common/loans'
import { createLoanIncomeNotification } from './create-notification'
import { filterDefined } from '../../common/util/array'
import { newEndpointNoAuth } from './api'
import { batchedWaitAll } from '../../common/util/promise'

const firestore = admin.firestore()

export const scheduleUpdateLoans = functions.pubsub
  // Run every day at midnight.
  .schedule('0 0 * * *')
  .timeZone('America/Los_Angeles')
  .onRun(async () => {
    try {
      console.log(await invokeFunction('updateloans'))
    } catch (e) {
      console.error(e)
    }
  })

export const updateloans = newEndpointNoAuth(
  { timeoutSeconds: 2000, memory: '8GiB', minInstances: 0 },
  async (_req) => {
    await updateLoansCore()
    return { success: true }
  }
)

async function updateLoansCore() {
  log('Updating loans...')

  const [users, contracts] = await Promise.all([
    getValues<User>(firestore.collection('users')),
    getValues<Contract>(
      firestore.collection('contracts').where('isResolved', '==', false)
    ),
  ])

  const contractBets = await batchedWaitAll(
    contracts.map(
      (contract) => async () =>
        getValues<Bet>(
          firestore.collection('contracts').doc(contract.id).collection('bets')
        )
    ),
    100
  )
  const bets = sortBy(contractBets.flat(), (b) => b.createdTime)

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

  const eligibleUsers = users.filter((u) =>
    isUserEligibleForLoan(portfolioByUser[u.id])
  )
  const userUpdates = eligibleUsers.map((user) => {
    const userContractBets = groupBy(
      betsByUser[user.id] ?? [],
      (b) => b.contractId
    )
    const result = getUserLoanUpdates(userContractBets, contractsById)
    return { user, result }
  })

  const betUpdates = userUpdates.map((u) => u.result.updates).flat()
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

  log(`${userUpdates.length} user payouts`)

  await Promise.all(
    userUpdates.map(({ user, result: { payout } }) => payUser(user.id, payout))
  )

  const today = new Date().toDateString().replace(' ', '-')
  const key = `loan-notifications-${today}`
  await Promise.all(
    userUpdates
      // Don't send a notification if the payout is < Ṁ1,
      // because a Ṁ0 loan is confusing.
      .filter(({ result: { payout } }) => payout >= 1)
      .map(({ user, result: { payout } }) =>
        createLoanIncomeNotification(user, key, payout)
      )
  )

  log('Notifications sent!')
}
