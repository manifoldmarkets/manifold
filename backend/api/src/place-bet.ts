import { groupBy, isEqual, mapValues, sumBy, uniq } from 'lodash'
import { APIError, type APIHandler } from './helpers/endpoint'
import { CPMM_MIN_POOL_QTY, MarketContract } from 'common/contract'
import { User } from 'common/user'
import {
  BetInfo,
  CandidateBet,
  getBinaryCpmmBetInfo,
  getNewMultiCpmmBetInfo,
} from 'common/new-bet'
import { removeUndefinedProps } from 'common/util/object'
import { Bet, LimitBet } from 'common/bet'
import { floatingEqual } from 'common/util/math'
import { log, metrics } from 'shared/utils'
import { Answer } from 'common/answer'
import { CpmmState, getCpmmProbability } from 'common/calculate-cpmm'
import { ValidatedAPIParams } from 'common/api/schema'
import * as crypto from 'crypto'
import { formatMoneyWithDecimals } from 'common/util/format'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import { bulkIncrementBalances, incrementBalance } from 'shared/supabase/users'
import { runShortTrans } from 'shared/short-transaction'
import { convertBet } from 'common/supabase/bets'
import {
  bulkInsertBets,
  cancelLimitOrders,
  insertBet,
} from 'shared/supabase/bets'
import { broadcastOrders } from 'shared/websockets/helpers'
import { betsQueue } from 'shared/helpers/fn-queue'
import { FLAT_TRADE_FEE } from 'common/fees'
import { redeemShares } from './redeem-shares'
import { updateAnswers } from 'shared/supabase/answers'
import { updateContract } from 'shared/supabase/contracts'
import {
  fetchContractBetDataAndValidate,
  getUnfilledBets,
  getUserBalances,
} from 'shared/helpers/bet-cache'
import { filterDefined } from 'common/util/array'
import { onCreateBets } from 'api/on-create-bet'

export const placeBet: APIHandler<'bet'> = async (props, auth) => {
  const isApi = auth.creds.kind === 'key'
  const startTime = Date.now()
  const { user, contract, answers, unfilledBets, balanceByUserId } =
    await fetchContractBetDataAndValidate(
      createSupabaseDirectClient(),
      props,
      auth.uid,
      isApi,
      true
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
  const simulatedMakerIds = getMakerIdsFromBetResult(simulatedResult)
  const deps = [auth.uid, contract.id, ...simulatedMakerIds]
  log(
    `[cache]PRE place bet took: ${Date.now() - startTime}ms, answer id: ${
      props.answerId
    }, amount: ${props.amount}, startTime: ${startTime}`
  )
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

  const { contractId, replyToCommentId, dryRun } = body
  const awaitStart = Date.now()
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
  log(
    `fetchContractBetDataAndValidate took ${
      Date.now() - awaitStart
    }ms for ${contractId}`
  )
  // Simulate bet to see whose limit orders you match.
  const simulationStart = Date.now()
  const simulatedResult = calculateBetResult(
    body,
    user,
    contract,
    answers,
    unfilledBets,
    balanceByUserId
  )
  const simulationEnd = Date.now()
  log(`Simulation took ${simulationEnd - simulationStart}ms`)

  if (dryRun) {
    return {
      result: {
        ...simulatedResult.newBet,
        betId: 'dry-run',
      },
      continue: () => Promise.resolve(),
    }
  }
  const simulatedMakerIds = getMakerIdsFromBetResult(simulatedResult)

  const transactionStart = Date.now()
  const result = await runShortTrans(async (pgTrans) => {
    log(`Inside main transaction for ${uid} placing a bet on ${contractId}.`)

    // Refetch just user balances in transaction, since queue only enforces contract and bets not changing.
    const balanceFetchStart = Date.now()
    const balanceByUserId = await getUserBalances(pgTrans, [
      uid,
      ...simulatedMakerIds, // Fetch just the makers that matched in the simulation.
    ])
    const balanceFetchEnd = Date.now()
    log(`Balance fetch took ${balanceFetchEnd - balanceFetchStart}ms`)

    user.balance = balanceByUserId[uid]
    if (user.balance < body.amount)
      throw new APIError(403, 'Insufficient balance.')

    for (const userId of unfilledBetUserIds) {
      if (!(userId in balanceByUserId)) {
        // Assume other makers have infinite balance since they are not involved in this bet.
        balanceByUserId[userId] = Number.MAX_SAFE_INTEGER
      }
    }

    const betCalculationStart = Date.now()
    const newBetResult = calculateBetResult(
      body,
      user,
      contract,
      answers,
      unfilledBets,
      balanceByUserId
    )
    const betCalculationEnd = Date.now()
    log(`Bet calculation took ${betCalculationEnd - betCalculationStart}ms`)

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
      throw new APIError(
        503,
        'Please try betting again. (Matched limit orders changed from simulated values.)'
      )
    }

    const betGroupId =
      contract.mechanism === 'cpmm-multi-1' && contract.shouldAnswersSumToOne
        ? crypto.randomBytes(12).toString('hex')
        : undefined

    const executionStart = Date.now()
    const executionResult = await executeNewBetResult(
      pgTrans,
      newBetResult,
      contract,
      user,
      isApi,
      replyToCommentId,
      betGroupId
    )
    const executionEnd = Date.now()
    log(`Bet execution took ${executionEnd - executionStart}ms`)

    return executionResult
  })
  const transactionEnd = Date.now()
  log(`Main transaction took ${transactionEnd - transactionStart}ms`)

  const { newBet, fullBets, allOrdersToCancel, betId, makers, betGroupId } =
    result

  log(`Main transaction finished - auth ${uid}.`)
  metrics.inc('app/bet_count', { contract_id: contractId })

  const continuation = async () => {
    const onCreateBetsStart = Date.now()
    await onCreateBets(fullBets, contract, user, allOrdersToCancel, makers)
    const onCreateBetsEnd = Date.now()
    log(`onCreateBets took ${onCreateBetsEnd - onCreateBetsStart}ms`)
  }

  const time = Date.now() - startTime
  log(
    `Place bet took ${time}ms, answer id: ${body.answerId}, amount: ${body.amount}, startTime: ${startTime}`
  )

  return {
    result: { ...newBet, betId, betGroupId },
    continue: continuation,
  }
}

const calculateBetResult = (
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
    const binaryCpmmStart = Date.now()
    const result = getBinaryCpmmBetInfo(
      contract,
      outcome,
      amount,
      limitProb,
      unfilledBets,
      balanceByUserId,
      expiresAt
    )
    const binaryCpmmEnd = Date.now()
    log(`getBinaryCpmmBetInfo took ${binaryCpmmEnd - binaryCpmmStart}ms`)
    return result
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
    if ('resolution' in answer && answer.resolution)
      throw new APIError(403, 'Answer is resolved and cannot be bet on')
    if (shouldAnswersSumToOne && answers.length < 2)
      throw new APIError(
        403,
        'Cannot bet until at least two answers are added.'
      )

    const roundedLimitProb = getRoundedLimitProb(limitProb)

    const multiCpmmStart = Date.now()
    const result = getNewMultiCpmmBetInfo(
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
    const multiCpmmEnd = Date.now()
    log(`getNewMultiCpmmBetInfo took ${multiCpmmEnd - multiCpmmStart}ms`)
    return result
  } else {
    throw new APIError(
      400,
      'Contract type/mechanism not supported (or is no longer)'
    )
  }
}

export const getUnfilledBetsAndUserBalances = async (
  pgTrans: SupabaseTransaction,
  contractId: string,
  answerId?: string
) => {
  const unfilledBetsStart = Date.now()
  const unfilledBets = await getUnfilledBets(pgTrans, contractId, answerId)
  const unfilledBetsEnd = Date.now()
  log(`getUnfilledBets took ${unfilledBetsEnd - unfilledBetsStart}ms`)

  const userIds = uniq(unfilledBets.map((bet) => bet.userId))
  const userBalancesStart = Date.now()
  const balanceByUserId = await getUserBalances(pgTrans, userIds)
  const userBalancesEnd = Date.now()
  log(`getUserBalances took ${userBalancesEnd - userBalancesStart}ms`)

  return { unfilledBets, balanceByUserId }
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
  replyToCommentId?: string,
  betGroupId?: string
) => {
  const allOrdersToCancel: LimitBet[] = []
  const fullBets: Bet[] = []

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
    userId: user.id,
    isApi,
    replyToCommentId,
    betGroupId,
    ...newBet,
  })
  const insertBetStart = Date.now()
  const betRow = await insertBet(candidateBet, pgTrans)
  const insertBetEnd = Date.now()
  log(`insertBet took ${insertBetEnd - insertBetStart}ms`)

  fullBets.push(convertBet(betRow))
  log(`Inserted bet for ${user.username} - auth ${user.id}.`)

  if (makers && makers.length > 0) {
    const updateMakersStart = Date.now()
    await updateMakers(makers, betRow.bet_id, contract, pgTrans)
    const updateMakersEnd = Date.now()
    log(`updateMakers took ${updateMakersEnd - updateMakersStart}ms`)
  }
  if (ordersToCancel) {
    allOrdersToCancel.push(...ordersToCancel)
  }

  const apiFee = isApi ? FLAT_TRADE_FEE : 0
  const incrementBalanceStart = Date.now()
  await incrementBalance(pgTrans, user.id, {
    balance: -newBet.amount - apiFee,
  })
  const incrementBalanceEnd = Date.now()
  log(`incrementBalance took ${incrementBalanceEnd - incrementBalanceStart}ms`)

  log(`Updated user ${user.username} balance - auth ${user.id}.`)

  const totalCreatorFee =
    newBet.fees.creatorFee +
    sumBy(otherBetResults, (r) => r.bet.fees.creatorFee)
  if (totalCreatorFee !== 0) {
    const incrementCreatorBalanceStart = Date.now()
    await incrementBalance(pgTrans, contract.creatorId, {
      balance: totalCreatorFee,
      totalDeposits: totalCreatorFee,
    })
    const incrementCreatorBalanceEnd = Date.now()
    log(
      `incrementCreatorBalance took ${
        incrementCreatorBalanceEnd - incrementCreatorBalanceStart
      }ms`
    )

    log(
      `Updated creator ${
        contract.creatorUsername
      } with fee gain ${formatMoneyWithDecimals(totalCreatorFee)} - ${
        contract.creatorId
      }.`
    )
  }

  const answerUpdates: {
    id: string
    poolYes: number
    poolNo: number
    prob: number
  }[] = []

  if (newBet.amount !== 0) {
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
    } else {
      const updateContractStart = Date.now()
      await updateContract(
        pgTrans,
        contract.id,
        removeUndefinedProps({
          pool: newPool,
          p: newP,
          totalLiquidity: newTotalLiquidity,
          prob: newPool && newP ? getCpmmProbability(newPool, newP) : undefined,
        })
      )
      const updateContractEnd = Date.now()
      log(`updateContract took ${updateContractEnd - updateContractStart}ms`)
    }

    if (otherBetResults) {
      const betsToInsert = filterDefined(
        otherBetResults.map((result) => {
          const { answer, bet, cpmmState, ordersToCancel } = result
          const { probBefore, probAfter } = bet
          const smallEnoughToIgnore =
            probBefore < 0.001 &&
            probAfter < 0.001 &&
            Math.abs(probAfter - probBefore) < 0.00001

          if (!smallEnoughToIgnore || Math.random() < 0.01) {
            const candidateBet = removeUndefinedProps({
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

            return candidateBet
          }

          allOrdersToCancel.push(...ordersToCancel)
          return undefined
        })
      )

      const bulkInsertStart = Date.now()
      const insertedBets = await bulkInsertBets(betsToInsert, pgTrans)
      const bulkInsertEnd = Date.now()
      log(`bulkInsertBets took ${bulkInsertEnd - bulkInsertStart}ms`)

      for (let i = 0; i < insertedBets.length; i++) {
        const betRow = insertedBets[i]
        fullBets.push(convertBet(betRow))

        const updateOtherMakersStart = Date.now()
        await updateMakers(
          otherBetResults[i].makers,
          betRow.bet_id,
          contract,
          pgTrans
        )
        const updateOtherMakersEnd = Date.now()
        log(
          `updateOtherMakers took ${
            updateOtherMakersEnd - updateOtherMakersStart
          }ms`
        )
      }
    }

    const updateAnswersStart = Date.now()
    await updateAnswers(pgTrans, contract.id, answerUpdates)
    const updateAnswersEnd = Date.now()
    log(`updateAnswers took ${updateAnswersEnd - updateAnswersStart}ms`)

    const cancelLimitOrdersStart = Date.now()
    await cancelLimitOrders(
      pgTrans,
      allOrdersToCancel.map((o) => o.id)
    )
    const cancelLimitOrdersEnd = Date.now()
    log(
      `cancelLimitOrders took ${
        cancelLimitOrdersEnd - cancelLimitOrdersStart
      }ms`
    )

    log(`Updated contract ${contract.slug} properties - auth ${user.id}.`)

    log('Redeeming shares for bettor', user.username, user.id)
    const redeemSharesStart = Date.now()
    await redeemShares(pgTrans, user.id, contract)
    const redeemSharesEnd = Date.now()
    log(`redeemShares took ${redeemSharesEnd - redeemSharesStart}ms`)
    log('Share redemption transaction finished.')
  }

  return {
    contract,
    newBet,
    betId: betRow.bet_id,
    makers,
    allOrdersToCancel,
    fullBets,
    user,
    betGroupId,
  }
}

export type maker = {
  bet: LimitBet
  amount: number
  shares: number
  timestamp: number
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
  makers: maker[],
  takerBetId: string,
  contract: MarketContract,
  pgTrans: SupabaseTransaction
) => {
  const updatedLimitBets: LimitBet[] = []
  const makersByBet = groupBy(makers, (maker) => maker.bet.id)
  if (Object.keys(makersByBet).length === 0) return
  const updates: Array<{
    id: string
    fills: any[]
    isFilled: boolean
    amount: number
    shares: number
  }> = []

  for (const makers of Object.values(makersByBet)) {
    const bet = makers[0].bet
    const newFills = makers.map((maker) => {
      const { amount, shares, timestamp } = maker
      return { amount, shares, matchedBetId: takerBetId, timestamp }
    })
    const fills = [...bet.fills, ...newFills]
    const totalShares = sumBy(fills, 'shares')
    const totalAmount = sumBy(fills, 'amount')
    const isFilled = floatingEqual(totalAmount, bet.orderAmount)

    updates.push({
      id: bet.id,
      fills,
      isFilled,
      amount: totalAmount,
      shares: totalShares,
    })
  }

  const bulkUpdateStart = Date.now()
  await bulkUpdateLimitOrders(pgTrans, updates)
  const bulkUpdateEnd = Date.now()
  log(`bulkUpdateLimitOrders took ${bulkUpdateEnd - bulkUpdateStart}ms`)

  // Fetch updated bets
  await pgTrans.map(
    `SELECT data
       FROM contract_bets
       WHERE bet_id IN ($1:csv)`,
    [updates.map((u) => u.id)],
    (r) => updatedLimitBets.push(r.data)
  )
  broadcastOrders(updatedLimitBets)

  // Deduct balance of makers.
  const spentByUser = mapValues(
    groupBy(makers, (maker) => maker.bet.userId),
    (makers) => sumBy(makers, (maker) => maker.amount)
  )

  const bulkIncrementBalancesStart = Date.now()
  await bulkIncrementBalances(
    pgTrans,
    Object.entries(spentByUser).map(([userId, spent]) => ({
      id: userId,
      balance: -spent,
    }))
  )
  const bulkIncrementBalancesEnd = Date.now()
  log(
    `bulkIncrementBalances took ${
      bulkIncrementBalancesEnd - bulkIncrementBalancesStart
    }ms`
  )

  const makerIds = Object.keys(spentByUser)
  if (makerIds.length > 0) {
    log('Redeeming shares for makers', makerIds)
    const redeemSharesForMakersStart = Date.now()
    await Promise.all(
      makerIds.map(async (userId) => redeemShares(pgTrans, userId, contract))
    )
    const redeemSharesForMakersEnd = Date.now()
    log(
      `redeemSharesForMakers took ${
        redeemSharesForMakersEnd - redeemSharesForMakersStart
      }ms`
    )
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
