import {
  groupBy,
  isEqual,
  mapValues,
  maxBy,
  orderBy,
  sumBy,
  uniq,
  uniqBy,
} from 'lodash'
import { APIError, type APIHandler } from './helpers/endpoint'
import { Contract, CPMM_MIN_POOL_QTY, MarketContract } from 'common/contract'
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
import { contractColumnsToSelect, isProd, log, metrics } from 'shared/utils'
import { Answer } from 'common/answer'
import { CpmmState, getCpmmProbability } from 'common/calculate-cpmm'
import { ValidatedAPIParams } from 'common/api/schema'
import { onCreateBets } from 'api/on-create-bet'
import {
  BANNED_TRADING_USER_IDS,
  BOT_USERNAMES,
  CASH_BETS_ENABLED,
  isAdminId,
  PARTNER_USER_IDS,
} from 'common/envs/constants'
import * as crypto from 'crypto'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import {
  bulkIncrementBalancesQuery,
  incrementBalance,
  incrementStreak,
} from 'shared/supabase/users'
import { runShortTrans } from 'shared/short-transaction'
import { convertBet } from 'common/supabase/bets'
import {
  bulkInsertBetsQuery,
  cancelLimitOrders,
  insertBet,
} from 'shared/supabase/bets'
import { betsQueue } from 'shared/helpers/fn-queue'
import { FLAT_TRADE_FEE } from 'common/fees'
import { redeemShares } from './redeem-shares'
import { updateAnswers } from 'shared/supabase/answers'
import { updateContract } from 'shared/supabase/contracts'
import { filterDefined } from 'common/util/array'
import { convertUser } from 'common/supabase/users'
import { convertAnswer, convertContract } from 'common/supabase/contracts'
import {
  UNIQUE_ANSWER_BETTOR_BONUS_AMOUNT,
  UNIQUE_BETTOR_BONUS_AMOUNT,
} from 'common/economy'
import { UniqueBettorBonusTxn } from 'common/txn'
import { insertTxn } from 'shared/txn/run-txn'
import {
  bulkUpdateContractMetricsQuery,
  bulkUpdateUserMetricsWithNewBetsOnly,
  getContractMetrics,
} from 'shared/helpers/user-contract-metrics'
import { MarginalBet } from 'common/calculate-metrics'
import { ContractMetric } from 'common/contract-metric'

export const placeBet: APIHandler<'bet'> = async (props, auth) => {
  const isApi = auth.creds.kind === 'key'

  let simulatedMakerIds: string[] = []
  if (props.deps === undefined) {
    const { user, contract, answers, unfilledBets, balanceByUserId } =
      await fetchContractBetDataAndValidate(
        createSupabaseDirectClient(),
        props,
        auth.uid,
        isApi
      )
    // Simulate bet to see whose limit orders you match.
    const simulatedResult = calculateBetResult(
      props,
      user,
      contract,
      answers,
      unfilledBets,
      balanceByUserId
    )
    simulatedMakerIds = getMakerIdsFromBetResult(simulatedResult)
  }

  const deps = [
    auth.uid,
    props.contractId,
    ...(props.deps ?? simulatedMakerIds),
  ]

  return await betsQueue.enqueueFn(
    () => placeBetMain(props, auth.uid, isApi),
    deps
  )
}

export const placeBetMain = async (
  body: ValidatedAPIParams<'bet'>,
  uid: string,
  isApi: boolean
) => {
  const startTime = Date.now()

  const { contractId, replyToCommentId, dryRun, deterministic, answerId } = body

  // Fetch data outside transaction first.
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
    user,
    contract,
    answers,
    unfilledBets,
    balanceByUserId
  )
  if (dryRun) {
    log('Dry run complete.')
    return {
      result: {
        ...simulatedResult.newBet,
        betId: 'dry-run',
      },
      continue: () => Promise.resolve(),
    }
  }
  const simulatedMakerIds = getMakerIdsFromBetResult(simulatedResult)

  const result = await runShortTrans(async (pgTrans) => {
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
      user,
      contract,
      answers,
      unfilledBets,
      balanceByUserId
    )
    const { newBet } = newBetResult
    if (!newBet.amount && !newBet.orderAmount && !newBet.shares) {
      throw new APIError(400, 'Betting allowed only between 1-99%.')
    }
    log(`Calculated new bet information for ${user.username} - auth ${uid}.`)

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
        ? crypto.randomBytes(12).toString('hex')
        : undefined

    const result = await executeNewBetResult(
      pgTrans,
      newBetResult,
      contract,
      user,
      isApi,
      contractMetrics,
      replyToCommentId,
      betGroupId,
      deterministic
    )
    const { updatedMetrics } = result
    log('Redeeming shares for bettor', user.username, user.id)
    const {
      betsToInsert: redemptionBetsToInsert,
      updatedMetrics: redemptionUpdatedMetrics,
      balanceUpdates,
    } = await redeemShares(
      pgTrans,
      [user.id],
      contract,
      [
        {
          ...newBetResult.newBet,
          userId: user.id,
        },
      ],
      updatedMetrics
    )
    if (redemptionBetsToInsert.length > 0) {
      const balanceQuery = bulkIncrementBalancesQuery(balanceUpdates)
      const insertBetsQuery = bulkInsertBetsQuery(redemptionBetsToInsert)
      const metricsQuery = bulkUpdateContractMetricsQuery(
        redemptionUpdatedMetrics
      )
      const results = await pgTrans.multi(
        `${balanceQuery}; ${insertBetsQuery}; ${metricsQuery};`
      )
      // TODO: broadcast user updates
      const userUpdates = results[0]
      const insertedBets = results[1].map(convertBet)
      result.fullBets.push(...insertedBets)
    }
    log('Share redemption transaction finished.')
    return { ...result, updatedMetrics: redemptionUpdatedMetrics }
  })

  const {
    newBet,
    fullBets,
    allOrdersToCancel,
    betId,
    makers,
    betGroupId,
    streakIncremented,
    bonuxTxn,
    updatedMetrics,
  } = result

  log(`Main transaction finished - auth ${uid}.`)
  metrics.inc('app/bet_count', { contract_id: contractId })

  const continuation = async () => {
    await onCreateBets(
      fullBets,
      contract,
      user,
      allOrdersToCancel,
      makers,
      streakIncremented,
      bonuxTxn,
      updatedMetrics
    )
  }

  const time = Date.now() - startTime
  log(`Place bet took ${time}ms.`)

  return {
    result: { ...newBet, betId, betGroupId },
    continue: continuation,
  }
}

export const fetchContractBetDataAndValidate = async (
  pgTrans: SupabaseTransaction | SupabaseDirectClient,
  body: {
    contractId: string
    amount: number | undefined
    answerId?: string
    answerIds?: string[]
  },
  uid: string,
  isApi: boolean
) => {
  const { amount, contractId } = body
  const answerIds =
    'answerIds' in body
      ? body.answerIds
      : 'answerId' in body && body.answerId !== undefined
      ? [body.answerId]
      : undefined

  const queries = `
    select * from users where id = $1;
    select ${contractColumnsToSelect} from contracts where id = $2;
    select * from answers
      where contract_id = $2 and (
          ($3 is null or id in ($3:list)) or
          (select (data->'shouldAnswersSumToOne')::boolean from contracts where id = $2)
          );
    select b.*, u.balance, u.cash_balance from contract_bets b join users u on b.user_id = u.id
        where b.contract_id = $2 and (
           ($3 is null or b.answer_id in ($3:list)) or
           (select (data->'shouldAnswersSumToOne')::boolean from contracts where id = $2)
           )
        and not b.is_filled and not b.is_cancelled;
    select data from user_contract_metrics where user_id = $1 and contract_id = $2 and
           ($3 is null or answer_id in ($3:list) or answer_id is null or            
           (select (data->'shouldAnswersSumToOne')::boolean from contracts where id = $2)
           );
    select status from system_trading_status where token = (select token from contracts where id = $2);
  `

  const results = await pgTrans.multi(queries, [
    uid,
    contractId,
    answerIds ?? null,
  ])
  const user = convertUser(results[0][0])
  const contract = convertContract(results[1][0])
  const answers = results[2].map(convertAnswer)
  const unfilledBets = results[3].map(convertBet) as (LimitBet & {
    balance: number
    cash_balance: number
  })[]
  const contractMetrics = results[4].map((r) => r.data) as ContractMetric[]
  const systemStatus = results[5][0]

  if (!systemStatus.status) {
    throw new APIError(
      403,
      `Trading with ${contract.token} is currently disabled.`
    )
  }

  if (!user) throw new APIError(404, 'User not found.')
  if (!contract) throw new APIError(404, 'Contract not found.')
  if (contract.mechanism === 'none' || contract.mechanism === 'qf')
    throw new APIError(400, 'This is not a market')

  const { closeTime, isResolved } = contract
  if (closeTime && Date.now() > closeTime)
    throw new APIError(403, 'Trading is closed.')
  if (isResolved) throw new APIError(403, 'Market is resolved.')

  const balanceByUserId = Object.fromEntries(
    uniqBy(unfilledBets, (b) => b.userId).map((bet) => [
      bet.userId,
      contract.token === 'CASH' ? bet.cash_balance : bet.balance,
    ])
  )
  const unfilledBetUserIds = Object.keys(balanceByUserId)
  const balance = contract.token === 'CASH' ? user.cashBalance : user.balance
  if (amount !== undefined && balance < amount)
    throw new APIError(403, 'Insufficient balance.')
  if (
    (!user.sweepstakesVerified || !user.idVerified) &&
    contract.token === 'CASH'
  ) {
    throw new APIError(
      403,
      'You must be kyc verified to trade on sweepstakes markets.'
    )
  }
  if (isAdminId(user.id) && contract.token === 'CASH' && isProd()) {
    throw new APIError(403, 'Admins cannot trade on sweepstakes markets.')
  }
  if (BANNED_TRADING_USER_IDS.includes(user.id) || user.userDeleted) {
    throw new APIError(403, 'You are banned or deleted. And not #blessed.')
  }
  log(
    `Loaded user ${user.username} with id ${user.id} betting on slug ${contract.slug} with contract id: ${contract.id}.`
  )
  if (contract.outcomeType === 'STONK' && isApi) {
    throw new APIError(403, 'API users cannot bet on STONK contracts.')
  }
  log(
    `Loaded user ${user.username} with id ${user.id} betting on slug ${contract.slug} with contract id: ${contract.id}.`
  )

  return {
    user,
    contract,
    answers,
    unfilledBets,
    balanceByUserId,
    unfilledBetUserIds,
    contractMetrics,
  }
}

export const calculateBetResult = (
  body: ValidatedAPIParams<'bet'>,
  user: User,
  contract: MarketContract,
  answers: Answer[] | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: Record<string, number>
) => {
  const { amount, contractId } = body
  const { outcomeType, mechanism } = contract

  if (
    (outcomeType == 'BINARY' ||
      outcomeType === 'PSEUDO_NUMERIC' ||
      outcomeType === 'STONK') &&
    mechanism == 'cpmm-1'
  ) {
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

    log(
      `Checking for limit orders in placebet for user ${user.id} on contract id ${contractId}.`
    )
    return getBinaryCpmmBetInfo(
      contract,
      outcome,
      amount,
      limitProb,
      unfilledBets,
      balanceByUserId,
      expiresAt
    )
  } else if (
    (outcomeType === 'MULTIPLE_CHOICE' || outcomeType === 'NUMBER') &&
    mechanism == 'cpmm-multi-1'
  ) {
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
      expiresAt
    )
  } else {
    throw new APIError(
      400,
      'Contract type/mechanism not supported (or is no longer)'
    )
  }
}

export const getUnfilledBets = async (
  pg: SupabaseDirectClient,
  contractId: string,
  answerId?: string
) => {
  return await pg.map(
    `select * from contract_bets
    where contract_id = $1
    and contract_bets.is_filled = false
    and contract_bets.is_cancelled = false
    ${answerId ? `and answer_id = $2` : ''}`,
    [contractId, answerId],
    (r) => convertBet(r) as LimitBet
  )
}

export const getUserBalancesAndMetrics = async (
  pgTrans: SupabaseTransaction | SupabaseDirectClient,
  userIds: string[],
  contract: Contract,
  answerId?: string
) => {
  const { token, id: contractId, mechanism } = contract
  // TODO: if we pass the makers' answerIds, we don't need to fetch the metrics for all answers
  const sumsToOne =
    mechanism === 'cpmm-multi-1' && contract.shouldAnswersSumToOne
  const results = await pgTrans.multi(
    `
      SELECT ${
        token === 'CASH' ? 'cash_balance AS balance' : 'balance'
      }, id FROM users WHERE id = ANY($1);
      
      select data from user_contract_metrics where user_id = any($1) and contract_id = $2 and
           ($3 is null or answer_id = $3 or answer_id is null);
    `,
    [userIds, contractId, sumsToOne ? null : answerId ?? null]
  )
  const balanceByUserId = Object.fromEntries(
    results[0].map((user) => [user.id, user.balance])
  )
  const contractMetrics = results[1].map((r) => r.data) as ContractMetric[]

  return { balanceByUserId, contractMetrics }
}

export const getUnfilledBetsAndUserBalances = async (
  pgTrans: SupabaseTransaction,
  contract: Contract,
  userId: string,
  answerId?: string
) => {
  const unfilledBets = await getUnfilledBets(pgTrans, contract.id, answerId)
  const userIds = uniq([userId, ...unfilledBets.map((bet) => bet.userId)])
  const { balanceByUserId, contractMetrics } = await getUserBalancesAndMetrics(
    pgTrans,
    userIds,
    contract,
    answerId
  )

  return { unfilledBets, balanceByUserId, contractMetrics }
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
  firstBetInMultiBet?: boolean
) => {
  if (contract.token === 'CASH' && !CASH_BETS_ENABLED) {
    throw new APIError(403, 'Cannot bet with CASH token atm.')
  }

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
    replyToCommentId,
    betGroupId,
    ...newBet,
  })

  // Just an unfilled limit order, no need to update metrics or maker shares
  if (newBet.amount === 0) {
    const { insertedBet: betRow, updatedMetrics } = await insertBet(
      candidateBet,
      pgTrans,
      contractMetrics
    )
    log(`Inserted bet for ${user.username} - auth ${user.id}.`)

    return {
      contract,
      newBet,
      betId: betRow.bet_id,
      makers,
      allOrdersToCancel: [],
      fullBets: [convertBet(betRow)],
      user,
      betGroupId,
      streakIncremented: false,
      bonuxTxn: undefined,
      updatedMetrics,
    }
  }
  const apiFee = isApi ? FLAT_TRADE_FEE : 0
  const betsToInsert: Bet[] = [candidateBet]
  const allOrdersToCancel: LimitBet[] = []
  const userBalanceUpdate = {
    id: user.id,
    [contract.token === 'CASH' ? 'cashBalance' : 'balance']:
      -newBet.amount - apiFee,
  }
  const makerIDsByTakerBetId: Record<string, maker[]> = {
    [candidateBet.id]: makers ?? [],
  }
  if (ordersToCancel) {
    allOrdersToCancel.push(...ordersToCancel)
  }

  const streakIncremented = await incrementStreak(
    pgTrans,
    user,
    newBet.createdTime
  )
  const sumsToOne =
    contract.mechanism === 'cpmm-multi-1' && contract.shouldAnswersSumToOne
  log(`Updated user ${user.username} balance - auth ${user.id}.`)
  const bonuxTxn =
    (contract.outcomeType !== 'NUMBER' || firstBetInMultiBet) &&
    !contractMetrics.find(
      (m) =>
        m.userId === user.id &&
        (sumsToOne ? true : m.answerId == candidateBet.answerId)
    )
      ? await giveUniqueBettorBonus(pgTrans, contract, user, newBet)
      : undefined
  const answerUpdates: {
    id: string
    poolYes: number
    poolNo: number
    prob: number
  }[] = []

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
          makerIDsByTakerBetId[candidateBet.id] = makers
          return candidateBet
        }

        allOrdersToCancel.push(...ordersToCancel)
        return undefined
      })
    )
    betsToInsert.push(...otherBetsToInsert)
  }
  const isUniqueBettor =
    (contract.outcomeType !== 'NUMBER' || firstBetInMultiBet) &&
    !contractMetrics.find((m) => m.userId === user.id)
  const lastBetTime =
    maxBy(betsToInsert, (b) => b.createdTime)?.createdTime ?? Date.now()
  const sharedContractUpdates: Partial<MarketContract> = removeUndefinedProps({
    lastBetTime,
    volume: contract.volume + sumBy(betsToInsert, (b) => Math.abs(b.amount)),
    lastUpdatedTime: lastBetTime,
    uniqueBettorCount: contract.uniqueBettorCount + (isUniqueBettor ? 1 : 0),
  })

  if (newBet.answerId) {
    // Multi-cpmm-1 contract
    if (newPool) {
      const { YES: poolYes, NO: poolNo } = newPool
      const prob = getCpmmProbability(newPool, 0.5)
      answerUpdates.push({
        id: newBet.answerId,
        poolYes,
        poolNo,
        prob,
      })
    }
    await updateContract(pgTrans, contract.id, sharedContractUpdates)
  } else {
    await updateContract(
      pgTrans,
      contract.id,
      removeUndefinedProps({
        pool: newPool,
        p: newP,
        totalLiquidity: newTotalLiquidity,
        prob: newPool && newP ? getCpmmProbability(newPool, newP) : undefined,
        ...sharedContractUpdates,
      })
    )
  }

  const bulkInsertStart = Date.now()
  const metrics =
    contract.outcomeType === 'NUMBER' && !firstBetInMultiBet
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

  const bulkInsertEnd = Date.now()
  log(`bulkInsertBets took ${bulkInsertEnd - bulkInsertStart}ms`)

  const {
    betsToInsert: redemptionBetsToInsert,
    updatedMetrics: redemptionUpdatedMetrics,
    balanceUpdates: redemptionAndLimitOrderBalanceUpdates,
  } = await updateMakers(
    makerIDsByTakerBetId,
    contract,
    updatedMetrics,
    pgTrans
  )
  log('update makers took', Date.now() - bulkInsertEnd)

  const balanceQuery = bulkIncrementBalancesQuery([
    userBalanceUpdate,
    ...redemptionAndLimitOrderBalanceUpdates,
  ])
  const insertBetsQuery = bulkInsertBetsQuery([
    ...betsToInsert,
    ...redemptionBetsToInsert,
  ])
  const metricsQuery = bulkUpdateContractMetricsQuery(redemptionUpdatedMetrics)
  const results = await pgTrans.multi(
    `${balanceQuery};
     ${insertBetsQuery};
     ${metricsQuery};`
  )
  // TODO: broadcast user updates
  const userUpdates = results[0]
  // TODO: Stop using the sql data, betsToInsert is fully formed
  const insertedBets = results[1].map(convertBet)
  await updateAnswers(pgTrans, contract.id, answerUpdates)
  await cancelLimitOrders(
    pgTrans,
    allOrdersToCancel.map((o) => o.id)
  )

  log(`Updated contract ${contract.slug} properties - auth ${user.id}.`)

  return {
    contract,
    newBet,
    betId: betsToInsert[0].id,
    makers,
    allOrdersToCancel,
    fullBets: insertedBets,
    user,
    betGroupId,
    streakIncremented,
    bonuxTxn,
    updatedMetrics: redemptionUpdatedMetrics,
  }
}

export async function bulkUpdateLimitOrders(
  db: SupabaseDirectClient,
  updates: Array<{
    id: string
    fills?: any[]
    isFilled?: boolean
    amount?: number
    shares?: number
  }>
) {
  if (updates.length > 0) {
    const values = updates
      .map((update) => {
        const updateData = {
          fills: update.fills,
          isFilled: update.isFilled,
          amount: update.amount,
          shares: update.shares,
        }
        return `('${update.id}', '${JSON.stringify(updateData)}'::jsonb)`
      })
      .join(',\n')

    await db.none(
      `UPDATE contract_bets AS c
       SET data = data || v.update
       FROM (VALUES ${values}) AS v(id, update)
       WHERE c.bet_id = v.id`
    )
  }
}

export const updateMakers = async (
  makersByTakerBetId: Record<string, maker[]>,
  contract: MarketContract,
  contractMetrics: ContractMetric[],
  pgTrans: SupabaseTransaction
) => {
  const allFillsAsNewBets: MarginalBet[] = []
  const allMakerIds: string[] = []
  const allSpentByUser: Record<string, number> = {}
  const allUpdates: Array<{
    id: string
    fills: any[]
    isFilled: boolean
    amount: number
    shares: number
  }> = []

  for (const [takerBetId, makers] of Object.entries(makersByTakerBetId)) {
    const makersByBet = groupBy(makers, (maker) => maker.bet.id)

    for (const makers of Object.values(makersByBet)) {
      const limitOrderBet = makers[0].bet
      const newFills = makers.map((maker) => {
        const { amount, shares, timestamp } = maker
        return { amount, shares, matchedBetId: takerBetId, timestamp }
      })
      const fills = [...limitOrderBet.fills, ...newFills]
      const totalShares = sumBy(fills, 'shares')
      const totalAmount = sumBy(fills, 'amount')
      const isFilled = floatingEqual(totalAmount, limitOrderBet.orderAmount)
      allFillsAsNewBets.push({
        ...limitOrderBet,
        amount: sumBy(newFills, 'amount'),
        shares: sumBy(newFills, 'shares'),
        createdTime: orderBy(newFills, 'timestamp', 'desc')[0].timestamp,
        loanAmount: 0,
        isRedemption: false,
      })
      allUpdates.push({
        id: limitOrderBet.id,
        fills,
        isFilled,
        amount: totalAmount,
        shares: totalShares,
      })
    }

    const spentByUser = mapValues(
      groupBy(makers, (maker) => maker.bet.userId),
      (makers) => sumBy(makers, (maker) => maker.amount)
    )

    for (const [userId, spent] of Object.entries(spentByUser)) {
      allSpentByUser[userId] = (allSpentByUser[userId] || 0) + spent
    }

    allMakerIds.push(...Object.keys(spentByUser))
  }

  if (allUpdates.length === 0) {
    return {
      betsToInsert: [],
      updatedMetrics: contractMetrics,
      balanceUpdates: [],
    }
  }

  const bulkUpdateStart = Date.now()
  await bulkUpdateLimitOrders(pgTrans, allUpdates)
  const allUpdatedMetrics = await bulkUpdateUserMetricsWithNewBetsOnly(
    pgTrans,
    allFillsAsNewBets,
    contractMetrics,
    false
  )
  const bulkUpdateEnd = Date.now()
  log(`bulkUpdateLimitOrders took ${bulkUpdateEnd - bulkUpdateStart}ms`)

  const bulkLimitOrderBalanceUpdates = Object.entries(allSpentByUser).map(
    ([userId, spent]) => ({
      id: userId,
      [contract.token === 'CASH' ? 'cashBalance' : 'balance']: -spent,
    })
  )

  const makerIds = uniq(allMakerIds)
  log('Redeeming shares for makers', makerIds)
  const {
    betsToInsert: redemptionBets,
    updatedMetrics: redemptionUpdatedMetrics,
    balanceUpdates: redemptionBalanceUpdates,
  } = await redeemShares(
    pgTrans,
    allMakerIds,
    contract,
    allFillsAsNewBets,
    allUpdatedMetrics
  )
  return {
    betsToInsert: redemptionBets,
    updatedMetrics: redemptionUpdatedMetrics,
    balanceUpdates: redemptionBalanceUpdates.concat(
      bulkLimitOrderBalanceUpdates
    ),
  }
}

export const getRoundedLimitProb = (limitProb: number | undefined) => {
  if (limitProb === undefined) return limitProb
  const isRounded = floatingEqual(Math.round(limitProb * 100), limitProb * 100)
  if (!isRounded)
    throw new APIError(
      400,
      'limitProb must be in increments of 0.01 (i.e. whole percentage points)'
    )

  return Math.round(limitProb * 100) / 100
}

export const getMakerIdsFromBetResult = (result: NewBetResult) => {
  const { makers = [], otherBetResults = [], ordersToCancel = [] } = result

  const makerUserIds = [
    ...makers,
    ...otherBetResults.flatMap((r) => r.makers),
  ].map((m) => m.bet.userId)

  const cancelledUserIds = [
    ...ordersToCancel,
    ...otherBetResults.flatMap((r) => r.ordersToCancel),
  ].map((o) => o.userId)

  return uniq([...makerUserIds, ...cancelledUserIds])
}

export const giveUniqueBettorBonus = async (
  tx: SupabaseTransaction,
  contract: Contract,
  bettor: User,
  bet: CandidateBet
) => {
  const { answerId, isRedemption, isApi } = bet

  const isBot = BOT_USERNAMES.includes(bettor.username)
  const isUnlisted = contract.visibility === 'unlisted'

  const answer =
    answerId && 'answers' in contract
      ? (contract.answers as Answer[]).find((a) => a.id == answerId)
      : undefined
  const answerCreatorId = answer?.userId
  const creatorId = answerCreatorId ?? contract.creatorId
  const isCreator = bettor.id == creatorId
  const isUnfilledLimitOrder =
    bet.limitProb !== undefined && (!bet.fills || bet.fills.length === 0)

  const isPartner =
    PARTNER_USER_IDS.includes(contract.creatorId) &&
    // Require the contract creator to also be the answer creator for real-money bonus.
    creatorId === contract.creatorId

  const isCashContract = contract.token === 'CASH'

  if (
    isCreator ||
    isBot ||
    isUnlisted ||
    isRedemption ||
    isUnfilledLimitOrder ||
    isApi ||
    isCashContract
  )
    return undefined

  // ian: removed the diminishing bonuses, but we could add them back via contract.uniqueBettorCount
  const bonusAmount =
    contract.mechanism === 'cpmm-multi-1'
      ? UNIQUE_ANSWER_BETTOR_BONUS_AMOUNT
      : UNIQUE_BETTOR_BONUS_AMOUNT

  const bonusTxnData = removeUndefinedProps({
    contractId: contract.id,
    uniqueNewBettorId: bettor.id,
    answerId,
    isPartner,
  })

  const bonusTxn: Omit<UniqueBettorBonusTxn, 'id' | 'createdTime'> = {
    fromType: 'BANK',
    fromId: 'BANK',
    toId: creatorId,
    toType: 'USER',
    amount: bonusAmount,
    token: 'M$',
    category: 'UNIQUE_BETTOR_BONUS',
    data: bonusTxnData,
  } as const
  await incrementBalance(tx, bonusTxn.toId, {
    balance: bonusAmount,
    totalDeposits: bonusAmount,
  })
  const txn = await insertTxn(tx, bonusTxn)

  log(`Bonus txn for user: ${contract.creatorId} completed:`, txn.id)
  return txn as UniqueBettorBonusTxn
}
