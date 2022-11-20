import { Dictionary, sumBy, minBy } from 'lodash'
import { Bet } from './bet'
import { getContractBetMetrics } from './calculate'
import {
  Contract,
  CPMM2Contract,
  CPMMContract,
  DPMContract,
} from './contract'
import { PortfolioMetrics } from './user'
import { filterDefined } from './util/array'

const LOAN_DAILY_RATE = 0.02

const calculateNewLoan = (investedValue: number, loanTotal: number) => {
  const netValue = investedValue - loanTotal
  return netValue * LOAN_DAILY_RATE
}

export const getUserLoanUpdates = (
  betsByContractId: { [contractId: string]: Bet[] },
  contractsById: { [contractId: string]: Contract }
) => {
  const updates = calculateLoanBetUpdates(betsByContractId, contractsById)
  return { updates, payout: sumBy(updates, (update) => update.newLoan) }
}

export const isUserEligibleForLoan = (
  portfolio: PortfolioMetrics | undefined
) => {
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

  return contracts
    .map((c) => {
      const bets = betsByContractId[c.id]
      if (c.mechanism === 'cpmm-1' || c.mechanism === 'cpmm-2') {
        return getCpmmContractLoanUpdate(c, bets) ?? []
      } 
      else if (c.mechanism === 'dpm-2')
        return filterDefined(getDpmContractLoanUpdate(c, bets))
      else {
        // Unsupported contract / mechanism for loans.
        return []
      }
    })
    .flat()
}

const getCpmmContractLoanUpdate = (contract: CPMMContract | CPMM2Contract, bets: Bet[]) => {
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

const getDpmContractLoanUpdate = (contract: DPMContract, bets: Bet[]) => {
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
