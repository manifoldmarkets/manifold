import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { getValues, log, payUser, writeAsync } from './utils'
import { Bet } from 'common/bet'
import { Contract, CPMMContract, FreeResponseContract } from 'common/contract'
import { PortfolioMetrics, User } from 'common/user'
import { Dictionary, groupBy, keyBy, minBy, sumBy } from 'lodash'
import { filterDefined } from 'common/util/array'
import { getContractBetMetrics } from 'common/calculate'
import { createLoanIncomeNotification } from './create-notification'

const firestore = admin.firestore()

export const updateLoans = functions
  .runWith({ memory: '1GB', timeoutSeconds: 540 })
  // Run every Monday.
  .pubsub.schedule('0 0 * * 1')
  .timeZone('America/Los_Angeles')
  .onRun(updateLoansCore)

async function updateLoansCore() {
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

  const contractsById = keyBy(contracts, (contract) => contract.id)
  const betsByUser = groupBy(bets, (bet) => bet.userId)

  const userLoanUpdates = eligibleUsers
    .map(
      (user) =>
        getUserLoanUpdates(betsByUser[user.id] ?? [], contractsById).betUpdates
    )
    .flat()

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

  const userPayouts = eligibleUsers
    .map((user) => {
      const updates = userLoanUpdates.filter(
        (update) => update.userId === user.id
      )
      return {
        user,
        payout: sumBy(updates, (update) => update.newLoan),
      }
    })
    .filter((update) => update.payout > 0)

  await Promise.all(
    userPayouts.map(({ user, payout }) => payUser(user.id, payout))
  )

  const today = new Date().toDateString().replace(' ', '_')
  const key = `loan-notifications/${today}`
  await Promise.all(
    userPayouts.map(({ user, payout }) =>
      createLoanIncomeNotification(user, key, payout)
    )
  )
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

const getUserLoanUpdates = (
  bets: Bet[],
  contractsById: Dictionary<Contract>
) => {
  const betsByContract = groupBy(bets, (bet) => bet.contractId)
  const contracts = filterDefined(
    Object.keys(betsByContract).map((contractId) => contractsById[contractId])
  )

  const betUpdates = filterDefined(
    contracts
      .map((c) => {
        if (c.outcomeType === 'BINARY' && c.mechanism === 'cpmm-1') {
          return getBinaryContractLoanUpdate(c, betsByContract[c.id])
        } else if (c.outcomeType === 'FREE_RESPONSE')
          return getFreeResponseContractLoanUpdate(c, betsByContract[c.id])
        else {
          throw new Error(`Unsupported contract type: ${c.outcomeType}`)
        }
      })
      .flat()
  )

  const totalNewLoan = sumBy(betUpdates, (loanUpdate) => loanUpdate.loanTotal)

  return {
    totalNewLoan,
    betUpdates,
  }
}

const getBinaryContractLoanUpdate = (contract: CPMMContract, bets: Bet[]) => {
  const { invested } = getContractBetMetrics(contract, bets)
  const loanAmount = sumBy(bets, (bet) => bet.loanAmount ?? 0)
  const oldestBet = minBy(bets, (bet) => bet.createdTime)

  const newLoan = calculateNewLoan(invested, loanAmount)
  if (newLoan <= 0 || !oldestBet) return undefined

  const loanTotal = (oldestBet.loanAmount ?? 0) + newLoan

  return {
    userId: oldestBet.userId,
    contractId: contract.id,
    betId: oldestBet.id,
    newLoan,
    loanTotal,
  }
}

const getFreeResponseContractLoanUpdate = (
  contract: FreeResponseContract,
  bets: Bet[]
) => {
  const openBets = bets.filter((bet) => bet.isSold || bet.sale)

  return openBets.map((bet) => {
    const loanAmount = bet.loanAmount ?? 0
    const newLoan = calculateNewLoan(bet.amount, loanAmount)
    const loanTotal = loanAmount + newLoan

    return {
      userId: bet.userId,
      contractId: contract.id,
      betId: bet.id,
      newLoan,
      loanTotal,
    }
  })
}

const LOAN_WEEKLY_RATE = 0.05

const calculateNewLoan = (investedValue: number, loanTotal: number) => {
  const netValue = investedValue - loanTotal
  return netValue * LOAN_WEEKLY_RATE
}
