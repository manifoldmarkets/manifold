import * as functions from 'firebase-functions'
import { onRequest } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import { groupBy, chunk, shuffle } from 'lodash'
import { invokeFunction, log, payUser, writeAsync } from 'shared/utils'
import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
import { User } from 'common/user'
import { getUserLoanUpdates, isUserEligibleForLoan } from 'common/loans'
import { createLoanIncomeNotification } from 'shared/create-notification'
import { PortfolioMetrics } from 'common/portfolio-metrics'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { secrets } from 'common/secrets'

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
  { timeoutSeconds: 3600, memory: '16GiB', cpu: 6, minInstances: 0, secrets },
  async (_req, res) => {
    await updateLoansCore()
    res.status(200).json({ success: true })
  }
)

export async function updateLoansCore() {
  const pg = createSupabaseDirectClient()

  log('Updating loans...')

  const today = new Date().toDateString().replace(' ', '-')
  const key = `loan-notifications-${today}`
  const lockName = `update-loans-${today}`
  const lockRef = firestore.collection('locks').doc(lockName)
  await lockRef.create({}).catch((_e) => {
    throw new Error(
      `Could not acquire ${lockName} lock, which means it was probably already running`
    )
  })

  // Select users who did not already get a loan notification today.
  const users = await pg.map<User>(
    `select data from users`,
    // with users_got_loan as (
    //   select user_id from user_notifications
    //   where notification_id = $1
    // )
    // select data from users
    //  where users.id not in (select user_id from users_got_loan)
    [key],
    (r) => r.data
  )
  log(`Loaded ${users.length} users`)

  const contracts = await pg.map<Contract>(
    `select data from contracts
    where contracts.resolution is null
  `,
    [],
    (r) => r.data
  )
  log(`Loaded ${contracts.length} contracts.`)

  const bets = await pg.map<Bet>(
    `
    select contract_bets.data from contract_bets
    join contracts on contract_bets.contract_id = contracts.id
    where contracts.resolution is null
    order by contract_bets.created_time asc
  `,
    [],
    (r) => r.data
  )
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
  const userUpdates = eligibleUsers
    .map((user) => {
      const userContractBets = groupBy(
        betsByUser[user.id] ?? [],
        (b) => b.contractId
      )
      const result = getUserLoanUpdates(userContractBets, contractsById)
      return { user, result }
    })
    // Only pay out loans that are >= M1.
    .filter((p) => p.result.payout >= 1)

  const updateChunks = chunk(shuffle(userUpdates), 100)

  let i = 0
  for (const updateChunk of updateChunks) {
    log(`Paying out ${i + 1}/${updateChunks.length} chunk of loans...`)

    const userBetUpdates = await Promise.all(
      updateChunk.map(async ({ user, result }) => {
        const { updates, payout } = result

        await payUser(user.id, payout)
        await createLoanIncomeNotification(user, key, payout)

        return updates.map((update) => ({
          doc: firestore
            .collection('contracts')
            .doc(update.contractId)
            .collection('bets')
            .doc(update.betId),
          fields: {
            loanAmount: update.loanTotal,
          },
        }))
      })
    )

    const betUpdates = userBetUpdates.flat()
    log(
      `Writing ${betUpdates.length} bet updates for chunk ${i + 1}/${
        updateChunks.length
      }...`
    )
    await writeAsync(firestore, betUpdates)
    i++
  }

  await lockRef.delete()

  log(`${userUpdates.length} user loans paid out!`)
}
