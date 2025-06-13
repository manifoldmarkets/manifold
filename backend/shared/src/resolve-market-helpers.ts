import { mapValues, groupBy, sum, sumBy, keyBy, uniqBy } from 'lodash'
import {
  HOUSE_LIQUIDITY_PROVIDER_ID,
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import {
  Contract,
  contractPath,
  ContractToken,
  CPMMMultiContract,
  MarketContract,
} from 'common/contract'
import { LiquidityProvision } from 'common/liquidity-provision'
import { Txn, CancelUniqueBettorBonusTxn } from 'common/txn'
import { User } from 'common/user'
import { removeUndefinedProps } from 'common/util/object'
import { createContractResolvedNotifications } from './create-notification'
import { bulkUpdateContractMetricsQuery } from './helpers/user-contract-metrics'
import {
  TxnData,
  runTxnOutsideBetQueueIgnoringBalance,
  txnToRow,
} from './txn/run-txn'
import {
  revalidateStaticProps,
  isProd,
  log,
  getContractAndMetricsAndLiquidities,
} from './utils'
import {
  getLoanPayouts,
  getPayouts,
  groupPayoutsByUser,
  Payout,
} from 'common/payouts'
import { APIError } from 'common//api/utils'
import { trackPublicEvent } from 'shared/analytics'
import { recordContractEdit } from 'shared/record-contract-edit'
import {
  SERIAL_MODE,
  SupabaseTransaction,
  createSupabaseDirectClient,
} from './supabase/init'
import { Answer } from 'common/answer'
import { isAdminId, isModId } from 'common/envs/constants'
import { convertTxn } from 'common/supabase/txns'
import { updateAnswer, updateAnswers } from './supabase/answers'
import { bulkInsertQuery, updateDataQuery } from './supabase/utils'
import { bulkIncrementBalancesQuery, UserUpdate } from './supabase/users'
import {
  broadcastUpdatedContract,
  broadcastUpdatedMetrics,
} from './websockets/helpers'
import { ContractMetric } from 'common/contract-metric'
import { calculateUpdatedMetricsForContracts } from 'common/calculate-metrics'
import { PROFIT_FEE_FRACTION } from 'common/economy'

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
    const isLinkedMC = c.mechanism === 'cpmm-multi-1' && c.shouldAnswersSumToOne
    if (isLinkedMC && outcome === 'CANCEL') {
      throw new APIError(
        403,
        'Resolving linked multi-choice markets to N/A is temporarily disabled.'
      )
    }

    unresolvedContract = c as MarketContract
    if (unresolvedContract.isResolved) {
      throw new APIError(403, 'Contract is already resolved')
    }

    const resolutionTime = Date.now()
    const newCloseTime = closeTime
      ? Math.min(closeTime, resolutionTime)
      : closeTime

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
      liquidities
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
      if (allOtherAnswersResolved) {
        updatedContractAttrs = {
          ...updatedContractAttrs,
          resolution: finalResolution,
        }
      } else {
        updatedContractAttrs = {
          id: unresolvedContract.id,
        }
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
      resolvedContract.uniqueBettorCount < 100 ? 0 : -1000

    const userPayouts = groupPayoutsByUser(payouts)
    log('user payouts', { userPayouts })

    const negativePayouts = Object.values(userPayouts).filter(
      (p) => p < negPayoutThreshold
    )

    log('negative payouts', { negativePayouts })

    if (
      outcome === 'CANCEL' &&
      !isAdminId(resolver.id) &&
      !isModId(resolver.id) &&
      negativePayouts.length > 0
    ) {
      throw new APIError(
        403,
        'Negative payouts too large for resolution. Contact admin or mod.'
      )
    }

    if (updateAnswerAttrs && answerId) {
      const props = removeUndefinedProps(updateAnswerAttrs)
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
    const { balanceUpdatesQuery, insertTxnsQuery } = getPayUsersQueries(
      payouts,
      contractId,
      answerId,
      token,
      payoutFees
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
  liquidities: LiquidityProvision[]
) => {
  const resolutionProbability =
    probabilityInt !== undefined ? probabilityInt / 100 : undefined

  const resolutionProbs = resolutions
    ? (() => {
        const total = sum(Object.values(resolutions))
        return mapValues(resolutions, (p) => p / total)
      })()
    : undefined

  // Calculate loan payouts from contract metrics
  const loanPayouts = getLoanPayouts(contractMetrics, answerId)

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
  payoutFees: Payout[]
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

  const balanceUpdatesQuery = bulkIncrementBalancesQuery(balanceUpdates)
  const insertTxnsQuery = bulkInsertQuery('txns', txns.map(txnToRow), false)

  return { balanceUpdatesQuery, insertTxnsQuery }
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
