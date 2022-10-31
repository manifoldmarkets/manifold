import { Dictionary, groupBy, sumBy, minBy } from 'lodash'
import { Bet } from './bet'
import { getContractBetMetrics } from './calculate'
import {
  Contract,
  CPMMContract,
  FreeResponseContract,
  MultipleChoiceContract,
} from './contract'
import { PortfolioMetrics, User } from './user'
import { filterDefined } from './util/array'

const LOAN_DAILY_RATE = 0.02

const calculateNewLoan = (investedValue: number, loanTotal: number) => {
  const netValue = investedValue - loanTotal
  return netValue * LOAN_DAILY_RATE
}

export const getUserLoanUpdates = (
  betsByContractId: { [contractId: string]: Bet[] },
  contractsById: { [contractId: string]: Contract },
  portfolio?: PortfolioMetrics | undefined
) => {
  if (isUserEligibleForLoan(portfolio)) {
    const updates = calculateLoanBetUpdates(
      betsByContractId,
      contractsById
    ).betUpdates
    return { updates, payout: sumBy(updates, (update) => update.newLoan) }
  } else {
    return undefined
  }
}

export const getLoanUpdates = (
  users: User[],
  contractsById: { [contractId: string]: Contract },
  portfolioByUser: { [userId: string]: PortfolioMetrics | undefined },
  betsByUser: { [userId: string]: Bet[] }
) => {
  const userUpdates = filterDefined(
    users.map((user) => {
      const result = getUserLoanUpdates(
        groupBy(betsByUser[user.id] ?? [], (b) => b.contractId),
        contractsById,
        portfolioByUser[user.id]
      )
      return result ? { user, result } : undefined
    })
  )
  return {
    betUpdates: userUpdates.map((u) => u.result.updates).flat(),
    userPayouts: userUpdates.map(({ user, result: { payout } }) => ({
      user,
      payout,
    })),
  }
}

const isUserEligibleForLoan = (portfolio: PortfolioMetrics | undefined) => {
  if (!portfolio) return true

  const { balance, investmentValue } = portfolio
  return balance + investmentValue > 0
}

const calculateLoanBetUpdates = (
  betsByContractId: Dictionary<Bet[]>,
  contractsById: Dictionary<Contract>
) => {
  const contracts = filterDefined(
    Object.keys(betsByContractId).map((contractId) => contractsById[contractId])
  ).filter((c) => !c.isResolved)

  const betUpdates = filterDefined(
    contracts
      .map((c) => {
        if (c.mechanism === 'cpmm-1') {
          return getBinaryContractLoanUpdate(c, betsByContractId[c.id])
        } else if (
          c.outcomeType === 'FREE_RESPONSE' ||
          c.outcomeType === 'MULTIPLE_CHOICE'
        )
          return getFreeResponseContractLoanUpdate(c, betsByContractId[c.id])
        else {
          // Unsupported contract / mechanism for loans.
          return []
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
  if (!isFinite(newLoan) || newLoan <= 0 || !oldestBet) return undefined

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
  contract: FreeResponseContract | MultipleChoiceContract,
  bets: Bet[]
) => {
  const openBets = bets.filter((bet) => !bet.isSold && !bet.sale)

  return openBets.map((bet) => {
    const loanAmount = bet.loanAmount ?? 0
    const newLoan = calculateNewLoan(bet.amount, loanAmount)
    const loanTotal = loanAmount + newLoan

    if (!isFinite(newLoan) || newLoan <= 0) return undefined

    return {
      userId: bet.userId,
      contractId: contract.id,
      betId: bet.id,
      newLoan,
      loanTotal,
    }
  })
}
