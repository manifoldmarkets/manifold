import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { groupBy, keyBy, sortBy } from 'lodash'
import {
  getValues,
  invokeFunction,
  loadPaginated,
  log,
  payUser,
  writeAsync,
} from 'shared/utils'
import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
import { User } from 'common/user'
import { getUserLoanUpdates, isUserEligibleForLoan } from 'common/loans'
import { createLoanIncomeNotification } from './create-notification'
import { filterDefined } from 'common/util/array'
import { newEndpointNoAuth } from './api'
import { mapAsync } from 'common/util/promise'
import { CollectionReference, Query } from 'firebase-admin/firestore'
import { PortfolioMetrics } from 'common/portfolio-metrics'

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

export async function updateLoansCore() {
  log('Updating loans...')

  const [users, contracts] = await Promise.all([
    loadPaginated(firestore.collection('users') as CollectionReference<User>),
    loadPaginated(
      firestore
        .collection('contracts')
        .where('isResolved', '==', false) as Query<Contract>
    ),
  ])

  log(`Loaded ${users.length} users, ${contracts.length} contracts.`)

  const contractBets = await mapAsync(contracts, (contract) =>
    loadPaginated(
      firestore
        .collection('contracts')
        .doc(contract.id)
        .collection('bets') as CollectionReference<Bet>
    )
  )
  const bets = sortBy(contractBets.flat(), (b) => b.createdTime)

  log(`Loaded ${bets.length} bets.`)
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

  const today = new Date().toDateString().replace(' ', '-')
  const key = `loan-notifications-${today}`

  await mapAsync(userUpdates, async ({ user, result }) => {
    const { updates, payout } = result

    const betUpdates = updates.map((update) => ({
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
    await payUser(user.id, payout)

    if (payout >= 1) {
      // Don't send a notification if the payout is < Ṁ1,
      // because a Ṁ0 loan is confusing.
      await createLoanIncomeNotification(user, key, payout)
    }
  })

  log(`${userUpdates.length} user loans paid out!`)
}
