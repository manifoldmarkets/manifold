import { Dictionary, groupBy, sumBy, minBy } from 'lodash'
import { Bet } from './bet'
import { getContractBetMetrics } from './calculate'
import { Contract, CPMMContract, FreeResponseContract, MultipleChoiceContract } from './contract'
import { filterDefined } from './util/array'

export const getUserLoanUpdates = (
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
        if (c.mechanism === 'cpmm-1') {
          return getBinaryContractLoanUpdate(c, betsByContract[c.id])
        } else if (
          c.outcomeType === 'FREE_RESPONSE' ||
          c.outcomeType === 'MULTIPLE_CHOICE'
        )
          return getFreeResponseContractLoanUpdate(c, betsByContract[c.id])
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
  if (isNaN(newLoan) || newLoan <= 0 || !oldestBet) return undefined

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
  const openBets = bets.filter((bet) => bet.isSold || bet.sale)

  return openBets.map((bet) => {
    const loanAmount = bet.loanAmount ?? 0
    const newLoan = calculateNewLoan(bet.amount, loanAmount)
    const loanTotal = loanAmount + newLoan

    if (isNaN(newLoan) || newLoan <= 0) return undefined

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