import { Dictionary, first, sumBy, uniq } from 'lodash'
import { calculatePayout, getContractBetMetricsPerAnswer } from './calculate'
import { Bet, LimitBet } from './bet'
import { Contract, CPMMContract, DPMContract } from './contract'
import { User } from './user'
import { computeFills, getNewMultiBetInfo } from './new-bet'
import { getCpmmProbability } from './calculate-cpmm'
import { removeUndefinedProps } from './util/object'
import { logit } from './util/math'
import { ContractMetric } from 'common/contract-metric'
import { Answer } from 'common/answer'

const computeInvestmentValue = (
  bets: Bet[],
  contractsDict: { [k: string]: Contract }
) => {
  return sumBy(bets, (bet) => {
    const contract = contractsDict[bet.contractId]
    if (!contract || contract.isResolved) return 0
    if (bet.sale || bet.isSold) return 0

    let payout
    try {
      payout = calculatePayout(contract, bet, 'MKT')
    } catch (e) {
      console.log(
        'contract',
        contract.question,
        contract.mechanism,
        contract.id
      )
      console.error(e)
      payout = 0
    }
    const value = payout - (bet.loanAmount ?? 0)
    if (isNaN(value)) return 0
    return value
  })
}

export const computeInvestmentValueCustomProb = (
  bets: Bet[],
  contract: Contract,
  p: number
) => {
  return sumBy(bets, (bet) => {
    if (!contract) return 0
    if (bet.sale || bet.isSold) return 0
    const { outcome, shares } = bet

    const betP = outcome === 'YES' ? p : 1 - p

    const value = betP * shares
    if (isNaN(value)) return 0
    return value
  })
}

const getLoanTotal = (
  bets: Bet[],
  contractsDict: { [k: string]: Contract }
) => {
  return sumBy(bets, (bet) => {
    const contract = contractsDict[bet.contractId]
    if (!contract || contract.isResolved) return 0
    if (bet.sale || bet.isSold) return 0
    return bet.loanAmount ?? 0
  })
}

export const ELASTICITY_BET_AMOUNT = 100

export const computeElasticity = (
  unfilledBets: LimitBet[],
  contract: Contract,
  betAmount = ELASTICITY_BET_AMOUNT
) => {
  switch (contract.mechanism) {
    case 'cpmm-1':
      return computeBinaryCpmmElasticity(unfilledBets, contract, betAmount)
    case 'dpm-2':
      return computeDpmElasticity(contract, betAmount)
    default: // there are some contracts on the dev DB with crazy mechanisms
      return 1
  }
}

export const computeBinaryCpmmElasticity = (
  unfilledBets: LimitBet[],
  contract: CPMMContract,
  betAmount: number
) => {
  const sortedBets = unfilledBets.sort((a, b) => a.createdTime - b.createdTime)

  const userIds = uniq(unfilledBets.map((b) => b.userId))
  // Assume all limit orders are good.
  const userBalances = Object.fromEntries(
    userIds.map((id) => [id, Number.MAX_SAFE_INTEGER])
  )

  const cpmmState = {
    pool: contract.pool,
    p: contract.p,
  }

  const {
    cpmmState: { pool: poolY, p: pY },
  } = computeFills(
    cpmmState,
    'YES',
    betAmount,
    undefined,
    sortedBets,
    userBalances
  )
  const resultYes = getCpmmProbability(poolY, pY)

  const {
    cpmmState: { pool: poolN, p: pN },
  } = computeFills(
    cpmmState,
    'NO',
    betAmount,
    undefined,
    sortedBets,
    userBalances
  )
  const resultNo = getCpmmProbability(poolN, pN)

  // handle AMM overflow
  const safeYes = Number.isFinite(resultYes)
    ? Math.min(resultYes, 0.995)
    : 0.995
  const safeNo = Number.isFinite(resultNo) ? Math.max(resultNo, 0.005) : 0.005

  return logit(safeYes) - logit(safeNo)
}

export const computeBinaryCpmmElasticityFromAnte = (
  ante: number,
  betAmount = ELASTICITY_BET_AMOUNT
) => {
  const pool = { YES: ante, NO: ante }
  const p = 0.5

  const cpmmState = {
    pool,
    p,
  }

  const {
    cpmmState: { pool: poolY, p: pY },
  } = computeFills(cpmmState, 'YES', betAmount, undefined, [], {})
  const resultYes = getCpmmProbability(poolY, pY)

  const {
    cpmmState: { pool: poolN, p: pN },
  } = computeFills(cpmmState, 'NO', betAmount, undefined, [], {})
  const resultNo = getCpmmProbability(poolN, pN)

  // handle AMM overflow
  const safeYes = Number.isFinite(resultYes) ? resultYes : 1
  const safeNo = Number.isFinite(resultNo) ? resultNo : 0

  return logit(safeYes) - logit(safeNo)
}

export const computeDpmElasticity = (
  contract: DPMContract,
  betAmount: number
) => {
  const afterProb = getNewMultiBetInfo('', betAmount + 1, contract).newBet
    .probAfter

  const initialProb = getNewMultiBetInfo('', 1, contract).newBet.probAfter

  return logit(afterProb) - logit(initialProb)
}

export const calculateNewPortfolioMetrics = (
  user: User,
  contractsById: { [k: string]: Contract },
  unresolvedBets: Bet[]
) => {
  const investmentValue = computeInvestmentValue(unresolvedBets, contractsById)
  const loanTotal = getLoanTotal(unresolvedBets, contractsById)
  return {
    investmentValue: investmentValue,
    balance: user.balance,
    totalDeposits: user.totalDeposits,
    loanTotal,
    timestamp: Date.now(),
    userId: user.id,
  }
}

export const calculateMetricsByContractAndAnswer = (
  betsByContractId: Dictionary<Bet[]>,
  contractsById: Dictionary<Contract>,
  user: User,
  answersByContractId: Dictionary<Answer[]>
) => {
  return Object.entries(betsByContractId).map(([contractId, bets]) => {
    const contract: Contract = contractsById[contractId]
    const answers = answersByContractId[contractId]
    return calculateUserMetrics(contract, bets, user, answers)
  })
}

export const calculateUserMetrics = (
  contract: Contract,
  bets: Bet[],
  user?: User,
  answers?: Answer[]
) => {
  // ContractMetrics will have an answerId for every answer, and a null for the overall metrics.
  const currentMetrics = getContractBetMetricsPerAnswer(contract, bets, answers)
  const bet = first(bets)
  return currentMetrics.map((current) => {
    return removeUndefinedProps({
      ...current,
      contractId: contract.id,
      userName: user?.name ?? bet?.userName,
      userId: user?.id ?? bet?.userId,
      userUsername: user?.username ?? bet?.userUsername,
      userAvatarUrl: user?.avatarUrl ?? bet?.userAvatarUrl,
    } as ContractMetric)
  })
}
