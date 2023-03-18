import * as functions from 'firebase-functions'
import { onRequest } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import { groupBy, sortBy } from 'lodash'
import {
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
import { createLoanIncomeNotification } from 'shared/create-notification'
import { mapAsync } from 'common/util/promise'
import { CollectionReference, Query } from 'firebase-admin/firestore'
import { PortfolioMetrics } from 'common/portfolio-metrics'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { secrets } from 'functions/secrets'

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

export const updateloans = onRequest(
  { timeoutSeconds: 2000, memory: '8GiB', minInstances: 0, secrets },
  async (_req, res) => {
    await updateLoansCore()
    res.status(200).json({ success: true })
  }
)

export async function updateLoansCore() {
  const pg = createSupabaseDirectClient()

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

  const userPortfolios = Object.fromEntries(
    await pg.map(
      `select distinct on (user_id) user_id, ts, investment_value, balance, total_deposits
       from user_portfolio_history order by user_id, ts desc`,
      [],
      (r) => [
        r.user_id as string,
        {
          userId: r.user_id as string,
          timestamp: Date.parse(r.ts as string),
          investmentValue: parseFloat(r.investment_value as string),
          balance: parseFloat(r.balance as string),
          totalDeposits: parseFloat(r.total_deposits as string),
        } as PortfolioMetrics,
      ]
    )
  )
  log(`Loaded ${users.length} portfolios.`)

  const contractsById = Object.fromEntries(
    contracts.map((contract) => [contract.id, contract])
  )
  const betsByUser = groupBy(bets, (bet) => bet.userId)

  const eligibleUsers = users.filter((u) =>
    isUserEligibleForLoan(userPortfolios[u.id])
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
