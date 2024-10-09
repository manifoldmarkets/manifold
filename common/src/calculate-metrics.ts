import { Dictionary, groupBy, min, orderBy, sum, sumBy, uniq } from 'lodash'
import {
  calculatePayout,
  calculateTotalSpentAndShares,
  getContractBetMetricsPerAnswer,
} from './calculate'
import { Bet, LimitBet } from './bet'
import {
  Contract,
  CPMMMultiContract,
  CPMMMultiNumeric,
  getAdjustedProfit,
} from './contract'
import { User } from './user'
import { computeFills } from './new-bet'
import { CpmmState, getCpmmProbability } from './calculate-cpmm'
import { removeUndefinedProps } from './util/object'
import { floatingEqual, logit } from './util/math'
import { ContractMetric } from 'common/contract-metric'
import { Answer } from 'common/answer'
import { noFees } from './fees'
import { DisplayUser } from './api/user-types'

export const computeInvestmentValue = (
  bets: Bet[],
  contractsDict: { [k: string]: Contract }
) => {
  let investmentValue = 0
  let cashInvestmentValue = 0
  for (const bet of bets) {
    const contract = contractsDict[bet.contractId]
    if (!contract || contract.isResolved) continue

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
    if (isNaN(value)) continue

    if (contract.token === 'CASH') {
      cashInvestmentValue += value
    } else {
      investmentValue += value
    }
  }

  return { investmentValue, cashInvestmentValue }
}

export const computeInvestmentValueCustomProb = (
  bets: Bet[],
  contract: Contract,
  p: number
) => {
  return sumBy(bets, (bet) => {
    if (!contract) return 0
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
    return bet.loanAmount ?? 0
  })
}

export const ELASTICITY_BET_AMOUNT = 10000 // readjust with platform volume

export const computeElasticity = (
  unfilledBets: LimitBet[],
  contract: Contract,
  betAmount = ELASTICITY_BET_AMOUNT
) => {
  const { mechanism, isResolved } = contract

  switch (mechanism) {
    case 'cpmm-1':
      return computeBinaryCpmmElasticity(
        isResolved ? [] : unfilledBets, // only consider limit orders for open markets
        contract,
        betAmount
      )
    case 'cpmm-multi-1':
      return computeMultiCpmmElasticity(
        isResolved ? [] : unfilledBets, // only consider limit orders for open markets
        contract,
        betAmount
      )
    default: // there are some contracts on the dev DB with crazy mechanisms
      return 1_000_000
  }
}

export const computeBinaryCpmmElasticity = (
  unfilledBets: LimitBet[],
  cpmmState: CpmmState,
  betAmount: number
) => {
  const sortedBets = unfilledBets.sort((a, b) => a.createdTime - b.createdTime)

  const userIds = uniq(unfilledBets.map((b) => b.userId))
  // Assume all limit orders are good.
  const userBalances = Object.fromEntries(
    userIds.map((id) => [id, Number.MAX_SAFE_INTEGER])
  )

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
    collectedFees: noFees,
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

const computeMultiCpmmElasticity = (
  unfilledBets: LimitBet[],
  contract: CPMMMultiContract | CPMMMultiNumeric,
  betAmount: number
) => {
  const elasticities = contract.answers.map((a) => {
    const cpmmState = {
      pool: { YES: a.poolYes, NO: a.poolNo },
      p: 0.5,
      collectedFees: noFees,
    }
    const unfilledBetsForAnswer = unfilledBets.filter(
      (b) => b.answerId === a.id
    )
    return computeBinaryCpmmElasticity(
      unfilledBetsForAnswer,
      cpmmState,
      betAmount
    )
  })
  return min(elasticities) ?? 1_000_000
}

export const calculateNewPortfolioMetrics = (
  user: User,
  contractsById: { [k: string]: Contract },
  unresolvedBets: Bet[]
) => {
  const { investmentValue, cashInvestmentValue } = computeInvestmentValue(
    unresolvedBets,
    contractsById
  )
  const loanTotal = getLoanTotal(unresolvedBets, contractsById)
  return {
    investmentValue,
    cashInvestmentValue,
    balance: user.balance,
    cashBalance: user.cashBalance,
    spiceBalance: user.spiceBalance,
    totalDeposits: user.totalDeposits,
    totalCashDeposits: user.totalCashDeposits,
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

// Produced from 0 filled limit orders
export const isEmptyMetric = (m: ContractMetric) => {
  return (
    m.profit === 0 &&
    m.invested === 0 &&
    m.loan === 0 &&
    m.payout === 0 &&
    !m.hasShares &&
    sum(Object.values(m.totalSpent ?? {})) === 0
  )
}

export const calculateUserMetrics = (
  contract: Contract,
  bets: Bet[],
  user: DisplayUser,
  answers: Answer[]
) => {
  // ContractMetrics will have an answerId for every answer, and a null for the overall metrics.
  const currentMetrics = getContractBetMetricsPerAnswer(contract, bets, answers)

  return currentMetrics.map((current) => {
    return removeUndefinedProps({
      ...current,
      contractId: contract.id,
      userId: user.id,
      profitAdjustment: getAdjustedProfit(
        contract,
        current.profit,
        answers,
        current.answerId
      ),
    } as ContractMetric)
  })
}

export type MarginalBet = Pick<
  Bet,
  | 'userId'
  | 'answerId'
  | 'contractId'
  | 'amount'
  | 'shares'
  | 'outcome'
  | 'createdTime'
  | 'loanAmount'
  | 'isRedemption'
  | 'probAfter'
>

export const calculateUserMetricsWithNewBetsOnly = (
  newBets: MarginalBet[],
  um: Omit<ContractMetric, 'id'>
) => {
  const needsTotalSpentBackfilled = !um.totalSpent
  const initialTotalSpent: { [key: string]: number } = um.totalSpent ?? {}
  // TODO: remove this after backfilling
  if (needsTotalSpentBackfilled) {
    if (um.hasNoShares && !um.hasYesShares) {
      initialTotalSpent.NO = um.invested
    } else if (um.hasYesShares && !um.hasNoShares) {
      initialTotalSpent.YES = um.invested
    } else {
      initialTotalSpent.NO = um.invested / 2
      initialTotalSpent.YES = um.invested / 2
    }
  }

  const initialTotalShares = { ...um.totalShares }

  const { totalSpent, totalShares } = calculateTotalSpentAndShares(
    newBets,
    initialTotalSpent,
    initialTotalShares
  )

  const invested = sum(Object.values(totalSpent))
  const loan = sumBy(newBets, (b) => b.loanAmount ?? 0) + um.loan

  const hasShares = Object.values(totalShares).some(
    (shares) => !floatingEqual(shares, 0)
  )
  const hasYesShares = (totalShares.YES ?? 0) >= 1
  const hasNoShares = (totalShares.NO ?? 0) >= 1
  const soldOut = !hasNoShares && !hasYesShares
  const maxSharesOutcome = soldOut
    ? null
    : (totalShares.NO ?? 0) > (totalShares.YES ?? 0)
    ? 'NO'
    : 'YES'
  const lastBet = orderBy(newBets, (b) => b.createdTime, 'desc')[0]
  const payout = soldOut
    ? 0
    : maxSharesOutcome
    ? totalShares[maxSharesOutcome] *
      (maxSharesOutcome === 'NO' ? 1 - lastBet.probAfter : lastBet.probAfter)
    : 0
  const totalAmountSold =
    (um.totalAmountSold ?? 0) +
    sumBy(
      newBets.filter((b) => b.isRedemption || b.amount < 0),
      (b) => -b.amount
    )
  const totalAmountInvested =
    (um.totalAmountInvested ?? 0) +
    sumBy(
      newBets.filter((b) => b.amount > 0 && !b.isRedemption),
      (b) => b.amount
    )
  const profit = payout + totalAmountSold - totalAmountInvested
  const profitPercent = floatingEqual(totalAmountInvested, 0)
    ? 0
    : (profit / totalAmountInvested) * 100

  return {
    ...um,
    loan: floatingEqual(loan, 0) ? 0 : loan,
    invested: floatingEqual(invested, 0) ? 0 : invested,
    totalShares,
    hasNoShares,
    hasYesShares,
    hasShares,
    maxSharesOutcome,
    lastBetTime: lastBet.createdTime,
    totalSpent,
    payout: floatingEqual(payout, 0) ? 0 : payout,
    totalAmountSold: floatingEqual(totalAmountSold, 0) ? 0 : totalAmountSold,
    totalAmountInvested: floatingEqual(totalAmountInvested, 0)
      ? 0
      : totalAmountInvested,
    profit,
    profitPercent,
  }
}

export const calculateProfitMetricsWithProb = <
  T extends Omit<ContractMetric, 'id'> | ContractMetric
>(
  newProb: number,
  um: T
) => {
  const {
    maxSharesOutcome,
    totalAmountSold = 0,
    totalAmountInvested = 0,
    totalShares,
    hasNoShares,
    hasYesShares,
  } = um
  const soldOut = !hasNoShares && !hasYesShares
  const payout = soldOut
    ? 0
    : maxSharesOutcome
    ? totalShares[maxSharesOutcome] *
      (maxSharesOutcome === 'NO' ? 1 - newProb : newProb)
    : 0
  const profit = payout + totalAmountSold - totalAmountInvested
  const profitPercent = floatingEqual(totalAmountInvested, 0)
    ? 0
    : (profit / totalAmountInvested) * 100

  return {
    ...um,
    payout,
    profit,
    profitPercent,
  }
}

export const calculateAnswerMetricsWithNewBetsOnly = (
  newBets: MarginalBet[],
  userMetrics: ContractMetric[],
  contractId: string,
  isMultiMarket: boolean
) => {
  const betsByUser = groupBy(newBets, 'userId')

  return Object.entries(betsByUser).flatMap(([userId, bets]) => {
    // If it's a multi market, we need to summarize the stats for the null answer
    const oldSummary = userMetrics.find(
      (m) =>
        m.answerId === null &&
        m.userId === userId &&
        m.contractId === contractId
    )
    const userBetsByAnswer = groupBy(bets, 'answerId')
    const newMetrics = Object.entries(userBetsByAnswer).map(
      ([answerIdString, bets]) => {
        const answerId = answerIdString === 'undefined' ? null : answerIdString
        const oldMetric = userMetrics.find(
          (m) =>
            m.answerId === answerId &&
            m.userId === userId &&
            m.contractId === contractId
        )
        if (oldSummary && oldMetric && isMultiMarket) {
          // Subtract the old stats from the old summary metric
          applyMetricToSummary(oldMetric, oldSummary, false)
        }
        const userMetric =
          oldMetric ?? getDefaultMetric(userId, contractId, answerId)

        return calculateUserMetricsWithNewBetsOnly(bets, userMetric)
      }
    )
    if (!isMultiMarket) {
      return newMetrics
    }
    // Then add the new metric row stats to it
    const newSummary = oldSummary ?? getDefaultMetric(userId, contractId, null)
    newMetrics.forEach((m) => applyMetricToSummary(m, newSummary, true))
    return [...newMetrics, newSummary]
  })
}

export const getDefaultMetric = (
  userId: string,
  contractId: string,
  answerId: string | null
): Omit<ContractMetric, 'id'> => ({
  userId,
  contractId,
  answerId,
  loan: 0,
  invested: 0,
  totalShares: { NO: 0, YES: 0 },
  totalSpent: { NO: 0, YES: 0 },
  payout: 0,
  profit: 0,
  profitPercent: 0,
  profitAdjustment: undefined,
  hasNoShares: false,
  hasShares: false,
  hasYesShares: false,
  maxSharesOutcome: null,
  lastBetTime: 0,
  from: undefined,
  totalAmountInvested: 0,
  totalAmountSold: 0,
})

const defaultTimeScaleValues = {
  profit: 0,
  profitPercent: 0,
  invested: 0,
  prevValue: 0,
  value: 0,
}

// We could do this all in the database trigger, but the logic gets hairy
export const applyMetricToSummary = <
  T extends Omit<ContractMetric, 'id'> | ContractMetric
>(
  metric: T,
  summary: T,
  add: boolean
) => {
  const sign = add ? 1 : -1
  summary.totalShares['NO'] += sign * (metric.totalShares['NO'] ?? 0)
  summary.totalShares['YES'] += sign * (metric.totalShares['YES'] ?? 0)
  if (!summary.totalSpent) {
    summary.totalSpent = { NO: 0, YES: 0 }
  }
  if (metric.totalSpent) {
    summary.totalSpent['NO'] += sign * (metric.totalSpent['NO'] ?? 0)
    summary.totalSpent['YES'] += sign * (metric.totalSpent['YES'] ?? 0)
  }
  if (metric.profitAdjustment) {
    summary.profitAdjustment =
      (summary.profitAdjustment ?? 0) + sign * metric.profitAdjustment
  }
  summary.loan += sign * metric.loan
  summary.invested += sign * metric.invested
  summary.payout += sign * metric.payout
  summary.profit += sign * metric.profit
  summary.totalAmountInvested += sign * metric.totalAmountInvested
  summary.totalAmountSold += sign * metric.totalAmountSold
  summary.profitPercent = floatingEqual(summary.totalAmountInvested, 0)
    ? 0
    : (summary.profit / summary.totalAmountInvested) * 100

  summary.lastBetTime = Math.max(summary.lastBetTime, metric.lastBetTime)
  if (metric.from) {
    const timeScales = Object.keys(metric.from)
    summary.from = Object.fromEntries(
      timeScales.map((timeScale) => {
        const m = metric.from![timeScale]
        const s = summary.from?.[timeScale] ?? defaultTimeScaleValues
        const update = {
          profit: s.profit + sign * m.profit,
          invested: s.invested + sign * m.invested,
          prevValue: s.prevValue + sign * m.prevValue,
          value: s.value + sign * m.value,
        }
        const profitPercent =
          update.invested === 0 ? 0 : (update.profit / update.invested) * 100
        return [timeScale, { ...update, profitPercent }]
      })
    )
  }
  // These are set by the trigger:
  // summaryMetric.hasNoShares
  // summaryMetric.hasYesShares
  // summaryMetric.hasShares
  return summary
}
