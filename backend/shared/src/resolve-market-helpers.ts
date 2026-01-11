import { APIError } from 'common//api/utils'
import { Answer } from 'common/answer'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { calculateUpdatedMetricsForContracts } from 'common/calculate-metrics'
import {
  Contract,
  contractPath,
  ContractToken,
  CPMMMultiContract,
  MarketContract,
} from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { PROFIT_FEE_FRACTION } from 'common/economy'
import { calculateInterestPayouts } from './calculate-interest'
import {
  calculatePoolInterestCpmm1,
  calculatePoolInterestMulti,
} from './calculate-pool-interest'
import { isAdminId, isModId } from 'common/envs/constants'
import { LiquidityProvision } from 'common/liquidity-provision'
import { getPayouts, groupPayoutsByUser, Payout } from 'common/payouts'
import { LOAN_DAILY_INTEREST_RATE, MS_PER_DAY } from 'common/loans'
import { getLoanTrackingForContract } from './helpers/user-contract-loans'
import { convertTxn } from 'common/supabase/txns'
import { CancelUniqueBettorBonusTxn, Txn } from 'common/txn'
import { User } from 'common/user'
import { removeUndefinedProps } from 'common/util/object'
import { groupBy, keyBy, mapValues, sum, sumBy, uniqBy } from 'lodash'
import { trackPublicEvent } from 'shared/analytics'
import { recordContractEdit } from 'shared/record-contract-edit'
import { createContractResolvedNotifications } from './create-notification'
import { bulkUpdateContractMetricsQuery } from './helpers/user-contract-metrics'
import { updateAnswer, updateAnswers } from './supabase/answers'
import {
  createSupabaseDirectClient,
  SERIAL_MODE,
  SupabaseTransaction,
} from './supabase/init'
import { bulkIncrementBalancesQuery, UserUpdate } from './supabase/users'
import { bulkInsertQuery, updateDataQuery } from './supabase/utils'
import {
  runTxnOutsideBetQueueIgnoringBalance,
  TxnData,
  txnToRow,
} from './txn/run-txn'
import {
  getContractAndMetricsAndLiquidities,
  isProd,
  log,
  revalidateStaticProps,
} from './utils'
import {
  broadcastUpdatedContract,
  broadcastUpdatedMetrics,
} from './websockets/helpers'

export type ResolutionParams = {
  outcome: string
  probabilityInt?: number
  answerId?: string
  value?: number
  resolutions?: { [key: string]: number }
}

export const resolveMarketHelper = async (
  unresolvedContract: MarketContract,
  resolver: User,
  creator: User,
  { value, resolutions, probabilityInt, outcome, answerId }: ResolutionParams
) => {
  const pg = createSupabaseDirectClient()

  // TODO: Why not add this to front of bet queue?
  const {
    resolvedContract,
    updatedContractMetrics,
    payoutsWithoutLoans,
    updatedContractAttrs,
    userUpdates,
  } = await pg.tx({ mode: SERIAL_MODE }, async (tx) => {
    const { closeTime, id: contractId } = unresolvedContract
    const {
      contract: c,
      liquidities,
      contractMetrics,
    } = await getContractAndMetricsAndLiquidities(
      tx,
      unresolvedContract,
      answerId
    )
    const isIndieMC = c.mechanism === 'cpmm-multi-1' && !c.shouldAnswersSumToOne

    unresolvedContract = c as MarketContract
    if (unresolvedContract.isResolved) {
      throw new APIError(403, 'Contract is already resolved')
    }

    const resolutionTime = Date.now()
    const newCloseTime = closeTime
      ? Math.min(closeTime, resolutionTime)
      : closeTime

    // Calculate pool with interest before calculating payouts
    // This ensures LPs receive interest on their locked capital
    if (unresolvedContract.mechanism === 'cpmm-1') {
      const poolWithInterest = calculatePoolInterestCpmm1(unresolvedContract)
      unresolvedContract.pool.YES = poolWithInterest.YES
      unresolvedContract.pool.NO = poolWithInterest.NO
    } else if (unresolvedContract.mechanism === 'cpmm-multi-1') {
      const multiContract = unresolvedContract as CPMMMultiContract
      const answers = multiContract.answers
      const poolUpdates = calculatePoolInterestMulti(multiContract, answers)
      const updateMap = new Map(poolUpdates.map((u) => [u.id, u]))
      for (const answer of answers) {
        const update = updateMap.get(answer.id)
        if (update) {
          answer.poolYes = update.poolYes
          answer.poolNo = update.poolNo
        }
      }
    }

    // Fetch loan tracking data for interest calculation
    const loanTracking = await getLoanTrackingForContract(
      tx,
      contractId,
      answerId
    )

    const {
      resolutionProbability,
      payouts,
      payoutsWithoutLoans,
      traderPayouts,
    } = getPayoutInfo(
      outcome,
      unresolvedContract,
      resolutions,
      probabilityInt,
      answerId,
      contractMetrics,
      liquidities,
      loanTracking
    )
    // Keep MKT resolution prob for consistency's sake
    const probBeforeResolution =
      outcome === 'MKT'
        ? resolutionProbability
        : unresolvedContract.mechanism === 'cpmm-1'
        ? unresolvedContract.prob
        : unresolvedContract.answers.find((a) => a.id === answerId)?.prob
    const newProb =
      outcome === 'YES' ? 1 : outcome === 'NO' ? 0 : probBeforeResolution
    let updatedContractAttrs: Partial<Contract> & { id: string } =
      removeUndefinedProps({
        id: unresolvedContract.id,
        isResolved: true,
        resolution: outcome,
        resolutionValue: value,
        resolutionTime,
        closeTime: newCloseTime,
        prob: newProb,
        resolutionProbability: probBeforeResolution,
        resolutions,
        resolverId: resolver.id,
        subsidyPool: 0,
        lastUpdatedTime: newCloseTime,
      })
    let updateAnswerAttrs: Partial<Answer> | undefined

    if (unresolvedContract.mechanism === 'cpmm-multi-1' && answerId) {
      // Only resolve the contract if all other answers are resolved.
      const allOtherAnswers = unresolvedContract.answers.filter(
        (a) => a.id !== answerId
      )
      const allOtherAnswersResolved = allOtherAnswers.every((a) => a.resolution)

      const marketCancelled =
        allOtherAnswers.every((a) => a.resolution === 'CANCEL') &&
        outcome === 'CANCEL'
      const finalResolution = marketCancelled ? 'CANCEL' : 'MKT'
      // Decrement contract's subsidyPool by this answer's share (divide by UNRESOLVED answers)
      const unresolvedAnswers = unresolvedContract.answers.filter(
        (a) => !a.resolutionTime
      )
      const numUnresolved = unresolvedAnswers.length || 1
      const subsidyPoolShare =
        (unresolvedContract.subsidyPool ?? 0) / numUnresolved
      const newContractSubsidyPool =
        (unresolvedContract.subsidyPool ?? 0) - subsidyPoolShare
      if (allOtherAnswersResolved) {
        updatedContractAttrs = {
          ...updatedContractAttrs,
          resolution: finalResolution,
        }
      } else {
        // Only update subsidyPool when not fully resolved
        updatedContractAttrs = removeUndefinedProps({
          id: unresolvedContract.id,
          subsidyPool: newContractSubsidyPool,
        })
      }
      updateAnswerAttrs = removeUndefinedProps({
        resolution: outcome,
        resolutionTime,
        resolutionProbability: probBeforeResolution,
        prob: newProb,
        resolverId: resolver.id,
      }) as Partial<Answer>
      // We have to update the denormalized answer data on the contract for the updateContractMetrics call
      updatedContractAttrs = {
        ...updatedContractAttrs,
        answers: unresolvedContract.answers.map((a) =>
          a.id === answerId
            ? {
                ...a,
                ...updateAnswerAttrs,
              }
            : a
        ),
      } as Partial<CPMMMultiContract> & { id: string }
    } else if (
      unresolvedContract.mechanism === 'cpmm-multi-1' &&
      updatedContractAttrs.isResolved
    ) {
      updateAnswerAttrs = removeUndefinedProps({
        resolutionTime,
        resolverId: resolver.id,
      }) as Partial<Answer>
      // We have to update the denormalized answer data on the contract for the updateContractMetrics call
      updatedContractAttrs = {
        ...updatedContractAttrs,
        answers: unresolvedContract.answers.map((a) => ({
          ...a,
          ...updateAnswerAttrs,
          prob: resolutions ? (resolutions[a.id] ?? 0) / 100 : a.prob,
          resolutionProbability: a.prob,
        })),
      } as Partial<CPMMMultiContract> & { id: string }
    }

    const resolvedContract = {
      ...unresolvedContract,
      ...updatedContractAttrs,
    } as MarketContract

    // handle exploit where users can get negative payouts
    const negPayoutThreshold =
      resolvedContract.uniqueBettorCount < 100 ? -10 : -1000

    const userPayouts = groupPayoutsByUser(payouts)
    log('user payouts', { userPayouts })

    const negativePayouts = Object.values(userPayouts).filter(
      (p) => p < negPayoutThreshold
    )

    log('negative payouts', { negativePayouts })

    if (updateAnswerAttrs && answerId) {
      const props = removeUndefinedProps({
        ...updateAnswerAttrs,
        subsidyPool: 0,
      })
      await updateAnswer(tx, answerId, props)
    } else if (
      updateAnswerAttrs &&
      resolvedContract.mechanism === 'cpmm-multi-1'
    ) {
      const answerUpdates = resolvedContract.answers.map((a) =>
        removeUndefinedProps({
          id: a.id,
          ...updateAnswerAttrs,
          prob: a.prob,
          resolutionProbability: a.resolutionProbability,
          subsidyPool: 0,
        })
      )
      await updateAnswers(tx, contractId, answerUpdates)
    }
    const { metricsByContract } = calculateUpdatedMetricsForContracts(
      [{ contract: resolvedContract, metrics: contractMetrics }],
      isIndieMC
    )
    const updatedContractMetrics = metricsByContract[resolvedContract.id] ?? []
    const updateMetricsQuery = bulkUpdateContractMetricsQuery(
      updatedContractMetrics
    )
    const { token } = resolvedContract
    const payoutFees =
      token === 'CASH'
        ? assessProfitFees(traderPayouts, updatedContractMetrics, answerId)
        : []

    // Calculate interest payouts (MANA only)
    // Determine resolution probability for interest valuation
    const resolutionProb =
      outcome === 'YES'
        ? 1
        : outcome === 'NO'
        ? 0
        : outcome === 'CANCEL'
        ? 0.5 // CANCEL pays based on 50% value
        : resolutionProbability ?? 0.5

    // Query already-paid interest from sells
    const alreadyPaidInterest = await tx.manyOrNone<{
      user_id: string
      answer_id: string | null
      total_paid: number
    }>(
      `SELECT 
        to_id as user_id,
        data->>'answerId' as answer_id,
        SUM(amount) as total_paid
      FROM txns 
      WHERE category = 'INTEREST_PAYOUT'
        AND data->>'contractId' = $1
        AND ($2::text IS NULL OR data->>'answerId' = $2)
      GROUP BY to_id, data->>'answerId'`,
      [contractId, answerId ?? null]
    )
    const paidInterestByUser = new Map(
      alreadyPaidInterest.map((r) => [
        `${r.user_id}-${r.answer_id ?? ''}`,
        r.total_paid,
      ])
    )

    const rawInterestPayouts = await calculateInterestPayouts(
      tx,
      contractId,
      resolutionTime,
      answerId,
      token,
      resolutionProb
    )

    // Subtract already-paid interest from sell transactions
    const interestPayouts = rawInterestPayouts
      .map((p) => {
        const key = `${p.userId}-${p.answerId ?? ''}`
        const alreadyPaid = paidInterestByUser.get(key) ?? 0
        return {
          ...p,
          interest: Math.max(0, p.interest - alreadyPaid),
        }
      })
      .filter((p) => p.interest > 0)

    if (interestPayouts.length > 0) {
      log('Interest payouts calculated', {
        count: interestPayouts.length,
        totalInterest: sumBy(interestPayouts, 'interest'),
        alreadyPaid: sum(Array.from(paidInterestByUser.values())),
      })
    }

    const { balanceUpdatesQuery, insertTxnsQuery, balanceUpdates } =
      getPayUsersQueries(
        payouts,
        contractId,
        answerId,
        token,
        payoutFees,
        interestPayouts
      )
    const contractUpdateQuery = updateDataQuery(
      'contracts',
      'id',
      updatedContractAttrs
    )

    log('updating contract & processing payouts', { updatedContractAttrs })
    const results = await tx.multi(`
      ${balanceUpdatesQuery}; -- 1
      ${insertTxnsQuery}; -- 2
      ${contractUpdateQuery}; -- 3
      ${updateMetricsQuery}; -- 4
      `)
    const userUpdates = results[0] as UserUpdate[]
    if (
      outcome === 'CANCEL' &&
      !isAdminId(resolver.id) &&
      !isModId(resolver.id)
    ) {
      checkForNegativeBalancesAndPayouts(userUpdates, balanceUpdates)
    }

    // TODO: we may want to support clawing back trader bonuses on MC markets too
    if (!answerId && outcome === 'CANCEL') {
      await undoUniqueBettorRewardsIfCancelResolution(tx, resolvedContract)
    }

    return {
      resolvedContract,
      payoutsWithoutLoans,
      updatedContractAttrs,
      userUpdates,
      updatedContractMetrics,
    }
  })

  broadcastUpdatedContract(resolvedContract.visibility, updatedContractAttrs)
  broadcastUpdatedMetrics(updatedContractMetrics)
  const userPayoutsWithoutLoans = groupPayoutsByUser(payoutsWithoutLoans)

  await trackPublicEvent(resolver.id, 'resolve market', {
    resolution: outcome,
    contractId: resolvedContract.id,
  })

  await recordContractEdit(
    unresolvedContract,
    resolver.id,
    Object.keys(updatedContractAttrs ?? {})
  )

  await revalidateStaticProps(contractPath(resolvedContract))
  const userIdToContractMetric = keyBy(
    updatedContractMetrics.filter((m) =>
      answerId ? m.answerId === answerId : m.answerId == null
    ),
    'userId'
  )
  await createContractResolvedNotifications(
    resolvedContract,
    resolver,
    creator,
    outcome,
    probabilityInt,
    value,
    answerId,
    {
      userIdToContractMetric,
      userPayouts: userPayoutsWithoutLoans,
      creatorPayout: 0,
      resolutionProbability: resolvedContract.resolutionProbability,
      resolutions,
    }
  )

  return { contract: resolvedContract, userUpdates }
}

export const getPayoutInfo = (
  outcome: string | undefined,
  unresolvedContract: Contract,
  resolutions: { [key: string]: number } | undefined,
  probabilityInt: number | undefined,
  answerId: string | undefined,
  contractMetrics: ContractMetric[],
  liquidities: LiquidityProvision[],
  loanTracking?: {
    user_id: string
    contract_id: string
    answer_id: string | null
    loan_day_integral: number
    last_loan_update_time: number
  }[]
) => {
  const resolutionProbability =
    probabilityInt !== undefined ? probabilityInt / 100 : undefined

  const resolutionProbs = resolutions
    ? (() => {
        const total = sum(Object.values(resolutions))
        return mapValues(resolutions, (p) => p / total)
      })()
    : undefined

  // Calculate loan payouts with interest from loan tracking data
  const loanPayouts = getLoanPayoutsWithInterest(
    contractMetrics,
    loanTracking ?? [],
    answerId
  )

  // Calculate payouts using contract metrics instead of bets
  const { traderPayouts, liquidityPayouts } = getPayouts(
    outcome,
    unresolvedContract,
    contractMetrics,
    liquidities,
    resolutionProbs,
    resolutionProbability,
    answerId
  )

  const payoutsWithoutLoans = [
    ...liquidityPayouts.map((p) => ({ ...p, deposit: p.payout })),
    ...traderPayouts,
  ]

  if (!isProd())
    console.log(
      'trader payouts:',
      traderPayouts,
      'liquidity payout:',
      liquidityPayouts,
      'loan payouts:',
      loanPayouts
    )

  const payouts = [...payoutsWithoutLoans, ...loanPayouts].filter(
    (p) => p.payout !== 0
  )

  return {
    payoutsWithoutLoans,
    contractMetrics,
    resolutionProbs,
    resolutionProbability,
    payouts,
    traderPayouts,
  }
}

type LoanTrackingData = {
  user_id: string
  contract_id: string
  answer_id: string | null
  loan_day_integral: number
  last_loan_update_time: number
}

const getLoanPayoutsWithInterest = (
  contractMetrics: ContractMetric[],
  loanTracking: LoanTrackingData[],
  answerId?: string
): Payout[] => {
  const now = Date.now()
  const metricsWithLoans = contractMetrics
    .filter((metric) => metric.loan)
    .filter((metric) => (answerId ? metric.answerId === answerId : true))

  const trackingByKey = keyBy(
    loanTracking,
    (t) => `${t.user_id}-${t.answer_id ?? ''}`
  )

  const metricsByUser = groupBy(metricsWithLoans, (metric) => metric.userId)

  const loansByUser = mapValues(metricsByUser, (metrics) =>
    sumBy(metrics, (metric) => {
      const loan = metric.loan ?? 0
      if (loan === 0) return 0

      const key = `${metric.userId}-${metric.answerId ?? ''}`
      const tracking = trackingByKey[key]

      // If no tracking data, just return the loan (no interest for legacy loans)
      if (!tracking) return -loan

      // Finalize the integral up to now
      const daysSinceLastUpdate =
        (now - tracking.last_loan_update_time) / MS_PER_DAY
      const finalIntegral =
        tracking.loan_day_integral + loan * daysSinceLastUpdate

      // Calculate interest
      const interest = finalIntegral * LOAN_DAILY_INTEREST_RATE

      return -(loan + interest)
    })
  )

  return Object.entries(loansByUser).map(([userId, payout]) => ({
    userId,
    payout,
  }))
}

async function undoUniqueBettorRewardsIfCancelResolution(
  pg: SupabaseTransaction,
  contract: Contract
) {
  const bonusTxnsOnThisContract = await pg.map<Txn>(
    `select * from txns where category = 'UNIQUE_BETTOR_BONUS'
      and to_id = $1
      and data->'data'->>'contractId' = $2`,
    [contract.creatorId, contract.id],
    convertTxn
  )

  log('total bonusTxnsOnThisContract ' + bonusTxnsOnThisContract.length)
  const totalBonusAmount = sumBy(bonusTxnsOnThisContract, (txn) => txn.amount)
  log('totalBonusAmount to be withdrawn ' + totalBonusAmount)

  if (totalBonusAmount === 0) {
    log('No bonus to cancel')
    return
  }

  const undoBonusTxn = {
    fromId: contract.creatorId,
    fromType: 'USER',
    toId: isProd()
      ? HOUSE_LIQUIDITY_PROVIDER_ID
      : DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
    toType: 'BANK',
    amount: totalBonusAmount,
    token: 'M$',
    category: 'CANCEL_UNIQUE_BETTOR_BONUS',
    data: {
      contractId: contract.id,
    },
  } as Omit<CancelUniqueBettorBonusTxn, 'id' | 'createdTime'>

  const txn = await runTxnOutsideBetQueueIgnoringBalance(pg, undoBonusTxn)
  log(`Cancel Bonus txn for user: ${contract.creatorId} completed: ${txn.id}`)
}

export const getPayUsersQueries = (
  payouts: Payout[],
  contractId: string,
  answerId: string | undefined,
  token: ContractToken,
  payoutFees: Payout[],
  interestPayouts: {
    userId: string
    answerId: string | null
    interest: number
    yesShareDays: number
    noShareDays: number
  }[] = []
) => {
  const payoutCash = token === 'CASH'
  const payoutToken = token === 'CASH' ? 'CASH' : 'M$'
  const mergedPayouts = checkAndMergePayouts(payouts)
  const payoutStartTime = Date.now()

  const balanceUpdates: {
    id: string
    balance?: number
    spiceBalance?: number
    totalDeposits?: number
    totalCashDeposits?: number
  }[] = []
  const txns: TxnData[] = []

  for (const { userId, payout, deposit } of mergedPayouts) {
    const userPayoutFees = payoutFees.filter((t) => t.userId === userId)
    if (userPayoutFees.length > 1) {
      throw new APIError(
        500,
        `Multiple payout fees for user: ${userId} on contract: ${contractId}`
      )
    }
    const payoutFee = userPayoutFees[0]?.payout ?? 0
    balanceUpdates.push({
      id: userId,
      [payoutCash ? 'cashBalance' : 'balance']: payout + payoutFee,
      [payoutCash ? 'totalCashDeposits' : 'totalDeposits']: deposit ?? 0,
    })

    txns.push({
      category: 'CONTRACT_RESOLUTION_PAYOUT',
      fromType: 'CONTRACT',
      fromId: contractId,
      toType: 'USER',
      toId: userId,
      amount: payout,
      token: payoutToken,
      data: removeUndefinedProps({
        deposit: deposit ?? 0,
        payoutStartTime,
        answerId,
      }),
      description: 'Contract payout for resolution: ' + contractId,
    })
  }

  for (const { userId, payout } of payoutFees) {
    const balanceUpdate = balanceUpdates.find((b) => b.id === userId)
    if (!balanceUpdate) {
      balanceUpdates.push({
        id: userId,
        [payoutCash ? 'cashBalance' : 'balance']: payout,
      })
    }

    txns.push({
      category: 'CONTRACT_RESOLUTION_FEE',
      fromType: 'USER',
      fromId: userId,
      toType: 'BANK',
      toId: isProd()
        ? HOUSE_LIQUIDITY_PROVIDER_ID
        : DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
      amount: -payout,
      token: payoutToken,
      data: removeUndefinedProps({
        contractId,
        payoutStartTime,
        answerId,
      }),
    })
  }

  // Add interest payouts (MANA only)
  for (const {
    userId,
    answerId: ansId,
    interest,
    yesShareDays,
    noShareDays,
  } of interestPayouts) {
    if (interest <= 0) continue

    const existingUpdate = balanceUpdates.find((b) => b.id === userId)
    if (existingUpdate) {
      existingUpdate.balance = (existingUpdate.balance ?? 0) + interest
    } else {
      balanceUpdates.push({
        id: userId,
        balance: interest,
      })
    }

    txns.push({
      category: 'INTEREST_PAYOUT',
      fromType: 'BANK',
      fromId: isProd()
        ? HOUSE_LIQUIDITY_PROVIDER_ID
        : DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
      toType: 'USER',
      toId: userId,
      amount: interest,
      token: 'M$',
      data: removeUndefinedProps({
        contractId,
        answerId: ansId,
        yesShareDays,
        noShareDays,
        payoutStartTime,
      }),
    })
  }

  const balanceUpdatesQuery = bulkIncrementBalancesQuery(balanceUpdates)
  const insertTxnsQuery = bulkInsertQuery('txns', txns.map(txnToRow), false)

  return { balanceUpdatesQuery, insertTxnsQuery, balanceUpdates }
}

const checkAndMergePayouts = (payouts: Payout[]) => {
  for (const { payout, deposit } of payouts) {
    if (!isFinite(payout)) {
      throw new Error('Payout is not finite: ' + payout)
    }
    if (deposit !== undefined && !isFinite(deposit)) {
      throw new Error('Deposit is not finite: ' + deposit)
    }
  }

  const groupedPayouts = groupBy(payouts, 'userId')
  return Object.values(
    mapValues(groupedPayouts, (payouts, userId) => ({
      userId,
      payout: sumBy(payouts, 'payout'),
      deposit: sumBy(payouts, (p) => p.deposit ?? 0),
    }))
  ).filter((p) => p!.payout !== 0 || p!.deposit !== 0)
}

const assessProfitFees = (
  payouts: Payout[],
  contractMetrics: Omit<ContractMetric, 'id'>[],
  answerId: string | undefined
) => {
  return uniqBy(payouts, 'userId')
    .map((payout) => {
      const contractMetric = contractMetrics.find(
        (m) => m.userId === payout.userId && m.answerId === (answerId ?? null)
      )
      if (!contractMetric) {
        throw new APIError(
          500,
          'Contract metric not found for user: ' + payout.userId
        )
      }

      const tax = contractMetric.profit * PROFIT_FEE_FRACTION
      return {
        userId: payout.userId,
        payout: contractMetric.profit > 0 ? -tax : 0,
      }
    })
    .filter((p) => p.payout !== 0)
}

export const checkForNegativeBalancesAndPayouts = (
  userUpdates: UserUpdate[],
  balanceDeltas: {
    id: string
    balance?: number
  }[]
) => {
  const negativeBalanceUsers = userUpdates.filter(
    (user) => user.balance !== undefined && user.balance < 0
  )
  // Only throw error if the balance update itself is below -1000
  const significantNegativeUpdatesOnNegativeBalanceUsers =
    negativeBalanceUsers.filter((user) => {
      const delta = balanceDeltas.find((d) => d.id === user.id)
      return delta && delta.balance !== undefined && delta.balance < -1000
    })

  if (significantNegativeUpdatesOnNegativeBalanceUsers.length > 0) {
    throw new APIError(
      400,
      `Negative balances & payouts too large as a result. Please tag @mods for help resolving this market.`
    )
  }
}
