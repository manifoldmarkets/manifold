import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { getValues, log, writeAsync } from './utils'
import { Bet, LimitBet } from 'common/bet'
import { Contract, CPMMContract, FreeResponseContract } from 'common/contract'
import { User } from 'common/user'
import { Dictionary, groupBy, keyBy, minBy, sumBy } from 'lodash'
import { filterDefined } from 'common/util/array'
import { getContractBetMetrics } from 'common/calculate'
import { calculateCpmmSale } from 'common/calculate-cpmm'
import { calculateDpmSaleAmount } from 'common/calculate-dpm'

const firestore = admin.firestore()

export const updateLoans = functions
  .runWith({ memory: '1GB', timeoutSeconds: 540 })
  // Run every Sunday, at 11:59pm.
  .pubsub.schedule('59 11 * * 0')
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

  const contractsById = keyBy(contracts, (contract) => contract.id)
  const betsByUser = groupBy(bets, (bet) => bet.userId)

  const userLoanUpdates = users
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
  const { totalShares } = getContractBetMetrics(contract, bets)
  const { YES, NO } = totalShares

  const shares = YES || NO
  const outcome = YES ? 'YES' : 'NO'

  const unfilledBets: LimitBet[] = []
  const { saleValue } = calculateCpmmSale(
    contract,
    shares,
    outcome,
    unfilledBets
  )
  const loanAmount = sumBy(bets, (bet) => bet.loanAmount ?? 0)
  const oldestBet = minBy(bets, (bet) => bet.createdTime)

  const newLoan = calculateNewLoan(saleValue, loanAmount)
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
  return bets.map((bet) => {
    const saleValue = calculateDpmSaleAmount(contract, bet)
    const loanAmount = bet.loanAmount ?? 0
    const newLoan = calculateNewLoan(saleValue, loanAmount)
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

const calculateNewLoan = (saleValue: number, loanTotal: number) => {
  const netValue = saleValue - loanTotal
  return netValue * LOAN_WEEKLY_RATE
}
