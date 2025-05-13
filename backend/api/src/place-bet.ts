import { first, isEqual, maxBy, sumBy } from 'lodash'
import { APIError, AuthedUser, type APIHandler } from './helpers/endpoint'
import { CPMM_MIN_POOL_QTY, MarketContract } from 'common/contract'
import { User } from 'common/user'
import {
  BetInfo,
  CandidateBet,
  getBinaryCpmmBetInfo,
  getNewMultiCpmmBetInfo,
} from 'common/new-bet'
import { removeUndefinedProps } from 'common/util/object'
import { Bet, getNewBetId, LimitBet, maker } from 'common/bet'
import { floatingEqual } from 'common/util/math'
import { log } from 'shared/utils'
import { Answer } from 'common/answer'
import { CpmmState, getCpmmProbability } from 'common/calculate-cpmm'
import { ValidatedAPIParams } from 'common/api/schema'
import { onCreateBets } from 'api/on-create-bet'
import {
  createSupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import {
  broadcastUserUpdates,
  bulkIncrementBalancesQuery,
  incrementStreakQuery,
  UserUpdate,
} from 'shared/supabase/users'
import { convertBet } from 'common/supabase/bets'
import {
  bulkInsertBetsQuery,
  cancelLimitOrdersQuery,
  insertZeroAmountLimitBet,
} from 'shared/supabase/bets'
import { betsQueue, ordersQueue } from 'shared/helpers/fn-queue'
import { FLAT_TRADE_FEE } from 'common/fees'
import { redeemShares } from './redeem-shares'
import { partialAnswerToRow } from 'shared/supabase/answers'
import { filterDefined } from 'common/util/array'
import { convertContract } from 'common/supabase/contracts'
import { UniqueBettorBonusTxn } from 'common/txn'
import {
  bulkUpdateContractMetricsQuery,
  bulkUpdateUserMetricsWithNewBetsOnly,
  getContractMetrics,
} from 'shared/helpers/user-contract-metrics'
import { ContractMetric } from 'common/contract-metric'
import {
  broadcastUpdatedAnswers,
  broadcastUpdatedContract,
} from 'shared/websockets/helpers'
import { bulkUpdateQuery, updateDataQuery } from 'shared/supabase/utils'
import { convertTxn } from 'common/supabase/txns'
import {
  fetchContractBetDataAndValidate,
  getMakerIdsFromBetResult,
  getRoundedLimitProb,
  getUniqueBettorBonusQuery,
  getUserBalancesAndMetrics,
  updateMakers,
} from 'api/helpers/bets'
import { runTransactionWithRetries } from 'shared/transact-with-retries'

export const placeBet: APIHandler<'bet'> = async (props, auth) => {
  const isApi = auth.creds.kind === 'key'
  const { deps, contractId, dryRun } = props

  if (deps === undefined || dryRun) {
    return queueDependenciesThenBet(props, auth, isApi)
  }

  // Worst thing that could happen from wrong deps is contention
  const fullDeps = [auth.uid, contractId, ...(deps ?? [])]
  return await betsQueue.enqueueFn(() => {
    return placeBetMain(props, auth.uid, isApi)
  }, fullDeps)
}

const queueDependenciesThenBet = async (
  props: ValidatedAPIParams<'bet'>,
  auth: AuthedUser,
  isApi: boolean
) => {
  const { dryRun, contractId } = props
  const minimalDeps = [auth.uid, contractId]
  return await ordersQueue.enqueueFn(async () => {
    const { contract, answers, unfilledBets, balanceByUserId } =
      await fetchContractBetDataAndValidate(
        createSupabaseDirectClient(),
        props,
        auth.uid,
        isApi
      )
    // Simulate bet to see whose limit orders you match.
    const simulatedResult = calculateBetResult(
      props,
      contract,
      answers,
      unfilledBets,
      balanceByUserId
    )
    if (dryRun)
      return {
        result: {
          ...simulatedResult.newBet,
          betId: 'dry-run',
        },
        continue: () => Promise.resolve(),
      }

    const makerIds = getMakerIdsFromBetResult(simulatedResult)
    return await betsQueue.enqueueFn(async () => {
      return placeBetMain(props, auth.uid, isApi)
    }, [...minimalDeps, ...makerIds])
  }, minimalDeps)
}

export const placeBetMain = async (
  body: ValidatedAPIParams<'bet'>,
  uid: string,
  isApi: boolean
) => {
  const startTime = Date.now()
  const { contractId, replyToCommentId, deterministic, answerId, silent } = body
  // Fetch data outside transaction first to avoid locking all limit orderers
  const {
    user,
    contract,
    answers,
    unfilledBets,
    balanceByUserId,
    unfilledBetUserIds,
  } = await fetchContractBetDataAndValidate(
    createSupabaseDirectClient(),
    body,
    uid,
    isApi
  )
  // Simulate bet to see whose limit orders you match.
  const simulatedResult = calculateBetResult(
    body,
    contract,
    answers,
    unfilledBets,
    balanceByUserId
  )
  const simulatedMakerIds = getMakerIdsFromBetResult(simulatedResult)

  const result = await runTransactionWithRetries(async (pgTrans) => {
    log(`Inside main transaction for ${uid} placing a bet on ${contractId}.`)
    // Refetch just user balance and metrics in transaction, since queue only enforces contract and bets not changing.
    const { balanceByUserId, contractMetrics } =
      await getUserBalancesAndMetrics(
        pgTrans,
        [uid, ...simulatedMakerIds], // Fetch just the makers that matched in the simulation.
        contract,
        answerId
      )
    user.balance = balanceByUserId[uid]
    if (user.balance < body.amount)
      throw new APIError(403, 'Insufficient balance.')

    for (const userId of unfilledBetUserIds) {
      if (!(userId in balanceByUserId)) {
        // Assume other makers have infinite balance since they are not involved in this bet.
        balanceByUserId[userId] = Number.MAX_SAFE_INTEGER
      }
    }
    const newBetResult = calculateBetResult(
      body,
      contract,
      answers,
      unfilledBets,
      balanceByUserId
    )
    log(`Calculated new bet information for ${user.username} - auth ${uid}.`)
    const { newBet } = newBetResult
    if (!newBet.amount && !newBet.orderAmount && !newBet.shares) {
      throw new APIError(400, 'Betting allowed only between 1-99%.')
    }
    const actualMakerIds = getMakerIdsFromBetResult(newBetResult)
    log(
      'simulated makerIds',
      simulatedMakerIds,
      'actualMakerIds',
      actualMakerIds
    )
    if (!isEqual(simulatedMakerIds, actualMakerIds)) {
      log.warn('Matched limit orders changed from simulated values.')
      throw new APIError(503, 'Please try betting again.')
    }

    const betGroupId =
      contract.mechanism === 'cpmm-multi-1' && contract.shouldAnswersSumToOne
        ? getNewBetId()
        : undefined

    return await executeNewBetResult(
      pgTrans,
      newBetResult,
      contract,
      user,
      isApi,
      contractMetrics,
      replyToCommentId,
      betGroupId,
      deterministic,
      false,
      isApi ? undefined : silent
    )
  })

  const { newBet, betId, betGroupId } = result

  log(`Main transaction finished - auth ${uid}.`)
  // metrics.inc('app/bet_count', { contract_id: contractId })

  const continuation = async () => {
    await onCreateBets(result)
  }

  const time = Date.now() - startTime
  log(`Place bet took ${time}ms.`)

  return {
    result: { ...newBet, betId, betGroupId },
    continue: continuation,
  }
}

export const calculateBetResult = (
  body: ValidatedAPIParams<'bet'>,
  contract: MarketContract,
  answers: Answer[] | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: Record<string, number>
) => {
  const { amount, expiresMillisAfter } = body
  const { outcomeType, mechanism } = contract

  if (mechanism == 'cpmm-1') {
    // eslint-disable-next-line prefer-const
    let { outcome, limitProb, expiresAt } = body
    if (expiresAt && expiresAt < Date.now())
      throw new APIError(400, 'Bet cannot expire in the past.')

    if (limitProb !== undefined && outcomeType === 'BINARY') {
      const isRounded = floatingEqual(
        Math.round(limitProb * 100),
        limitProb * 100
      )
      if (!isRounded)
        throw new APIError(
          400,
          'limitProb must be in increments of 0.01 (i.e. whole percentage points)'
        )

      limitProb = Math.round(limitProb * 100) / 100
    }

    return getBinaryCpmmBetInfo(
      contract,
      outcome,
      amount,
      limitProb,
      unfilledBets,
      balanceByUserId,
      expiresAt,
      expiresMillisAfter
    )
  } else if (mechanism == 'cpmm-multi-1') {
    const { shouldAnswersSumToOne } = contract
    if (!body.answerId || !answers) {
      throw new APIError(400, 'answerId must be specified for multi bets')
    }

    const { answerId, outcome, limitProb, expiresAt } = body
    if (expiresAt && expiresAt < Date.now())
      throw new APIError(403, 'Bet cannot expire in the past.')
    const answer = answers.find((a) => a.id === answerId)
    if (!answer) throw new APIError(404, 'Answer not found')
    if (answer.resolution)
      throw new APIError(403, 'Answer is resolved and cannot be bet on')
    if (shouldAnswersSumToOne && answers.length < 2)
      throw new APIError(
        403,
        'Cannot bet until at least two answers are added.'
      )

    const roundedLimitProb = getRoundedLimitProb(limitProb)

    return getNewMultiCpmmBetInfo(
      contract,
      answers,
      answer,
      outcome,
      amount,
      roundedLimitProb,
      unfilledBets,
      balanceByUserId,
      expiresAt,
      expiresMillisAfter
    )
  } else {
    throw new APIError(
      400,
      'Contract type/mechanism not supported (or is no longer)'
    )
  }
}

export type NewBetResult = BetInfo & {
  makers?: maker[]
  ordersToCancel?: LimitBet[]
  otherBetResults?: {
    answer: Answer
    bet: CandidateBet<Bet>
    cpmmState: CpmmState
    makers: maker[]
    ordersToCancel: LimitBet[]
  }[]
}
export const executeNewBetResult = async (
  pgTrans: SupabaseTransaction,
  newBetResult: NewBetResult,
  contract: MarketContract,
  user: User,
  isApi: boolean,
  contractMetrics: ContractMetric[],
  replyToCommentId?: string,
  betGroupId?: string,
  deterministic?: boolean,
  firstBetInMultiBet?: boolean,
  silent?: boolean
) => {
  const {
    newBet,
    otherBetResults,
    newPool,
    newTotalLiquidity,
    newP,
    makers,
    ordersToCancel,
  } = newBetResult
  const { mechanism } = contract
  if (
    mechanism == 'cpmm-1' &&
    (!newP ||
      !isFinite(newP) ||
      Math.min(...Object.values(newPool ?? {})) < CPMM_MIN_POOL_QTY)
  ) {
    throw new APIError(403, 'Trade too large for current liquidity pool.')
  }

  if (
    !isFinite(newBet.amount) ||
    !isFinite(newBet.shares) ||
    !isFinite(newBet.probAfter)
  ) {
    throw new APIError(
      500,
      'Bet calculation produced invalid number, please try again later.'
    )
  }

  const candidateBet = removeUndefinedProps({
    id: getNewBetId(),
    userId: user.id,
    isApi,
    silent,
    replyToCommentId,
    betGroupId,
    ...newBet,
  })

  // Just an unfilled limit order, no need to update metrics, maker shares, contract, etc.
  if (newBet.amount === 0) {
    const betRow = await insertZeroAmountLimitBet(candidateBet, pgTrans)
    log(`Inserted limit bet for ${user.username} - auth ${user.id}.`)
    return {
      contract,
      newBet,
      betId: betRow.bet_id,
      makers,
      cancelledLimitOrders: [],
      fullBets: [convertBet(betRow)],
      user,
      betGroupId,
      streakIncremented: false,
      updatedMetrics: [],
      bonusTxn: undefined,
      userUpdates: undefined,
      contractUpdate: undefined,
      answerUpdates: undefined,
      updatedMakers: [],
    }
  }
  const isNumberContract = contract.outcomeType === 'NUMBER'
  const apiFee = isApi ? FLAT_TRADE_FEE : 0
  const betsToInsert: Bet[] = [candidateBet]
  const allOrdersToCancel: LimitBet[] = filterDefined(ordersToCancel ?? [])
  const userBalanceUpdates = [
    {
      id: user.id,
      balance: -newBet.amount - apiFee + (newBet.loanAmount ?? 0),
    },
  ]
  const makersByTakerBetId: Record<string, maker[]> = {
    [candidateBet.id]: makers ?? [],
  }
  const answerUpdates: {
    id: string
    poolYes: number
    poolNo: number
    prob: number
  }[] = []

  const sumsToOne =
    contract.mechanism === 'cpmm-multi-1' && contract.shouldAnswersSumToOne
  let bonusTxnQuery = 'select 1 where false'
  if (
    (!isNumberContract || firstBetInMultiBet) &&
    !contractMetrics.find(
      (m) =>
        m.userId === user.id &&
        (sumsToOne ? true : m.answerId == candidateBet.answerId)
    )
  ) {
    const { balanceUpdate, txnQuery } = getUniqueBettorBonusQuery(
      contract,
      user,
      newBet
    )
    if (balanceUpdate) {
      userBalanceUpdates.push(balanceUpdate)
    }
    bonusTxnQuery = txnQuery
  }

  if (otherBetResults) {
    const otherBetsToInsert = filterDefined(
      otherBetResults.map((result) => {
        const { answer, bet, cpmmState, ordersToCancel, makers } = result
        const { probBefore, probAfter } = bet
        const smallEnoughToIgnore =
          probBefore < 0.001 &&
          probAfter < 0.001 &&
          Math.abs(probAfter - probBefore) < 0.00001

        if (deterministic || !smallEnoughToIgnore || Math.random() < 0.01) {
          const candidateBet = removeUndefinedProps({
            id: getNewBetId(),
            userId: user.id,
            isApi,
            betGroupId,
            ...bet,
          })

          const { YES: poolYes, NO: poolNo } = cpmmState.pool
          const prob = getCpmmProbability(cpmmState.pool, 0.5)
          answerUpdates.push({
            id: answer.id,
            poolYes,
            poolNo,
            prob,
          })
          makersByTakerBetId[candidateBet.id] = makers
          return candidateBet
        }

        allOrdersToCancel.push(...ordersToCancel)
        return undefined
      })
    )
    betsToInsert.push(...otherBetsToInsert)
  }
  const isUniqueBettor =
    (!isNumberContract || firstBetInMultiBet) &&
    !contractMetrics.find((m) => m.userId === user.id)
  const lastBetTime =
    maxBy(betsToInsert, (b) => b.createdTime)?.createdTime ?? Date.now()
  const contractUpdate: Partial<MarketContract> & { id: string } =
    removeUndefinedProps({
      id: contract.id,
      lastBetTime,
      volume: contract.volume + sumBy(betsToInsert, (b) => Math.abs(b.amount)),
      lastUpdatedTime: lastBetTime,
      uniqueBettorCount: contract.uniqueBettorCount + (isUniqueBettor ? 1 : 0),
      ...(contract.mechanism === 'cpmm-1'
        ? {
            pool: newPool,
            p: newP,
            totalLiquidity: newTotalLiquidity,
            prob:
              newPool && newP ? getCpmmProbability(newPool, newP) : undefined,
          }
        : {}),
    })
  // Multi-cpmm-1 contract
  if (newBet.answerId && newPool) {
    const { YES: poolYes, NO: poolNo } = newPool
    const prob = getCpmmProbability(newPool, 0.5)
    answerUpdates.push({
      id: newBet.answerId,
      poolYes,
      poolNo,
      prob,
    })
  }

  const metrics =
    isNumberContract && !firstBetInMultiBet
      ? await getContractMetrics(
          pgTrans,
          [user.id],
          contract.id,
          filterDefined(betsToInsert.map((b) => b.answerId)),
          true
        )
      : contractMetrics

  const updatedMetrics = await bulkUpdateUserMetricsWithNewBetsOnly(
    pgTrans,
    betsToInsert,
    metrics,
    false
  )

  const {
    betsToInsert: makerRedemptionBetsToInsert,
    updatedMetrics: makerRedemptionAndFillUpdatedMetrics,
    balanceUpdates: makerRedemptionAndFillBalanceUpdates,
    bulkUpdateLimitOrdersQuery,
    updatedMakers,
  } = await updateMakers(makersByTakerBetId, contract, updatedMetrics, pgTrans)
  // Create redemption bets for bettor w/o limit fills if needed:
  const {
    betsToInsert: bettorRedemptionBetsToInsert,
    updatedMetrics: bettorRedemptionUpdatedMetrics,
    balanceUpdates: bettorRedemptionBalanceUpdates,
  } = await redeemShares(
    pgTrans,
    [user.id],
    contract,
    [candidateBet],
    makerRedemptionAndFillUpdatedMetrics
  )

  const userBalanceUpdatesQuery = bulkIncrementBalancesQuery([
    ...userBalanceUpdates,
    ...makerRedemptionAndFillBalanceUpdates,
    ...bettorRedemptionBalanceUpdates,
  ])
  const insertedBets = [
    ...betsToInsert,
    ...makerRedemptionBetsToInsert,
    ...bettorRedemptionBetsToInsert,
  ]
  const insertBetsQuery = bulkInsertBetsQuery(insertedBets)
  const newMetrics = bettorRedemptionUpdatedMetrics.filter((m) => {
    const existingMetric = metrics.find(
      (m2) =>
        m2.userId === m.userId &&
        m2.answerId === m.answerId &&
        m2.contractId === m.contractId
    )
    return !existingMetric || !isEqual(existingMetric, m)
  })
  const metricsQuery = bulkUpdateContractMetricsQuery(newMetrics)
  const streakIncrementedQuery = incrementStreakQuery(user, newBet.createdTime)
  const contractUpdateQuery = updateDataQuery('contracts', 'id', contractUpdate)
  const answerUpdateQuery = bulkUpdateQuery(
    'answers',
    ['id'],
    answerUpdates.map(partialAnswerToRow)
  )
  const { query: cancelLimitsQuery, bets: cancelledLimitOrders } =
    cancelLimitOrdersQuery(allOrdersToCancel)
  const startTime = Date.now()
  const results = await pgTrans.multi(
    `
    ${userBalanceUpdatesQuery}; --0
    ${streakIncrementedQuery}; --1
    ${insertBetsQuery}; --2
    ${metricsQuery}; --3
    ${contractUpdateQuery}; --4
    ${answerUpdateQuery}; --5
    ${cancelLimitsQuery}; --6
    ${bulkUpdateLimitOrdersQuery}; --7
    ${bonusTxnQuery}; --8
     `
  )
  log(`placeBet bulk insert/update took ${Date.now() - startTime}ms`)
  const userUpdates = results[0] as UserUpdate[]
  const streakIncremented = results[1][0].streak_incremented
  const newContract = results[4].map(convertContract)[0]
  const bonusTxn = first(results[8].map(convertTxn)) as
    | UniqueBettorBonusTxn
    | undefined

  // On normal contracts, we do this in on-create-bet
  if (isNumberContract) {
    broadcastUserUpdates(userUpdates)
    broadcastUpdatedContract(newContract.visibility, contractUpdate)
    broadcastUpdatedAnswers(newContract.id, answerUpdates)
  }

  return {
    contract,
    newBet,
    betId: betsToInsert[0].id,
    makers,
    cancelledLimitOrders: cancelledLimitOrders,
    fullBets: insertedBets,
    user,
    betGroupId,
    streakIncremented,
    bonusTxn,
    updatedMetrics: bettorRedemptionUpdatedMetrics,
    answerUpdates,
    contractUpdate,
    userUpdates,
    updatedMakers,
  }
}
