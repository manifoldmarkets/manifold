import {
  groupBy,
  isEqual,
  mapValues,
  sortBy,
  sumBy,
  uniq,
  uniqBy,
} from 'lodash'
import { APIError, type APIHandler } from './helpers/endpoint'
import { CPMM_MIN_POOL_QTY, Contract, MarketContract } from 'common/contract'
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
import { getContract, getUser, log, metrics } from 'shared/utils'
import { Answer } from 'common/answer'
import { CpmmState, getCpmmProbability } from 'common/calculate-cpmm'
import { ValidatedAPIParams } from 'common/api/schema'
import { onCreateBets } from 'api/on-create-bet'
import { BLESSED_BANNED_USER_IDS } from 'common/envs/constants'
import * as crypto from 'crypto'
import { formatMoneyWithDecimals } from 'common/util/format'
import {
  SupabaseDirectClient,
  SupabaseTransaction,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { bulkIncrementBalances, incrementBalance } from 'shared/supabase/users'
import { runShortTrans } from 'shared/short-transaction'
import { convertBet } from 'common/supabase/bets'
import { cancelLimitOrders, insertBet } from 'shared/supabase/bets'
import { broadcastOrders } from 'shared/websockets/helpers'
import { betsQueue } from 'shared/helpers/fn-queue'
import { FLAT_TRADE_FEE } from 'common/fees'
import { redeemShares } from './redeem-shares'
import {
  getAnswer,
  getAnswersForContract,
  updateAnswer,
} from 'shared/supabase/answers'
import { updateContract } from 'shared/supabase/contracts'

export const placeBet: APIHandler<'bet'> = async (props, auth) => {
  const isApi = auth.creds.kind === 'key'
  return await betsQueue.enqueueFn(
    () => placeBetMain(props, auth.uid, isApi),
    [props.contractId, auth.uid]
  )
}

export const placeBetMain = async (
  body: ValidatedAPIParams<'bet'>,
  uid: string,
  isApi: boolean
) => {
  const startTime = Date.now()

  const { contractId, replyToCommentId } = body

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
  const simulatedMakerIds = getMakerIdsFromBetResult(simulatedResult)

  const result = await runShortTrans(async (pgTrans) => {
    log(`Inside main transaction for ${uid} placing a bet on ${contractId}.`)

    // Refetch just user balances in transaction, since queue only enforces contract and bets not changing.
    const balanceByUserId = await getUserBalances(pgTrans, [
      uid,
      ...simulatedMakerIds, // Fetch just the makers that matched in the simulation.
    ])
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

    return await executeNewBetResult(
      pgTrans,
      newBetResult,
      contract,
      user,
      isApi,
      replyToCommentId,
      betGroupId
    )
  })

  const { newBet, fullBets, allOrdersToCancel, betId, makers, betGroupId } =
    result

  log(`Main transaction finished - auth ${uid}.`)
  metrics.inc('app/bet_count', { contract_id: contractId })

  const continuation = async () => {
    await onCreateBets(fullBets, contract, user, allOrdersToCancel, makers)
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
  body: ValidatedAPIParams<'bet'> | ValidatedAPIParams<'multi-bet'>,
  uid: string,
  isApi: boolean
) => {
  const { amount, contractId } = body
  const answerId = 'answerId' in body ? body.answerId : undefined

  const contract = await getContract(pgTrans, contractId)
  if (!contract) throw new APIError(404, 'Contract not found.')
  if (contract.mechanism === 'none' || contract.mechanism === 'qf')
    throw new APIError(400, 'This is not a market')

  const { closeTime } = contract
  if (closeTime && Date.now() > closeTime)
    throw new APIError(403, 'Trading is closed.')

  const answersPromise = getAnswersForBet(
    pgTrans,
    contract,
    answerId,
    'answerIds' in body ? body.answerIds : undefined
  )

  const unfilledBets = await getUnfilledBets(
    pgTrans,
    contractId,
    // Fetch all limit orders if answers should sum to one.
    'shouldAnswersSumToOne' in contract && contract.shouldAnswersSumToOne
      ? undefined
      : answerId
  )
  const unfilledBetUserIds = uniq(unfilledBets.map((bet) => bet.userId))

  const [user, balanceByUserId] = await Promise.all([
    validateBet(pgTrans, uid, amount, contract, isApi),
    getUserBalances(pgTrans, unfilledBetUserIds),
  ])

  const answers = await answersPromise

  return {
    user,
    contract,
    answers,
    unfilledBets,
    balanceByUserId,
    unfilledBetUserIds,
  }
}

const getAnswersForBet = async (
  pgTrans: SupabaseDirectClient,
  contract: Contract,
  answerId: string | undefined,
  answerIds: string[] | undefined
) => {
  const { mechanism } = contract
  const contractId = contract.id

  if (answerId && mechanism === 'cpmm-multi-1') {
    if (contract.shouldAnswersSumToOne) {
      return await getAnswersForContract(pgTrans, contractId)
    } else {
      // Only fetch the one answer if it's independent multi.
      const answer = await getAnswer(pgTrans, answerId)
      if (answer)
        return sortBy(
          uniqBy([answer, ...contract.answers], (a) => a.id),
          (a) => a.index
        )
    }
  } else if (answerIds) {
    return await getAnswersForContract(pgTrans, contractId)
  }
  return undefined
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
    if ('resolution' in answer && answer.resolution)
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
    and (data->'isFilled')::boolean = false
    and (data->'isCancelled')::boolean = false
    ${answerId ? `and answer_id = $2` : ''}`,
    [contractId, answerId],
    (r) => convertBet(r) as LimitBet
  )
}

export const getUserBalances = async (
  pgTrans: SupabaseTransaction | SupabaseDirectClient,
  userIds: string[]
) => {
  const users =
    userIds.length === 0
      ? []
      : await pgTrans.map(
          `select balance, id from users where id = any($1)`,
          [userIds],
          (r) => r as { balance: number; id: string }
        )

  return Object.fromEntries(users.map((user) => [user.id, user.balance]))
}

export const getUnfilledBetsAndUserBalances = async (
  pgTrans: SupabaseTransaction,
  contractId: string,
  answerId?: string
) => {
  const unfilledBets = await getUnfilledBets(pgTrans, contractId, answerId)
  const userIds = uniq(unfilledBets.map((bet) => bet.userId))
  const balanceByUserId = await getUserBalances(pgTrans, userIds)

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
  const allOrdersToCancel = []
  const fullBets = [] as Bet[]

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

  // Special case for relationship markets.
  if (
    contract.isLove &&
    newPool &&
    contract.outcomeType === 'MULTIPLE_CHOICE'
  ) {
    const answer = contract.answers.find((a) => a.id === newBet.answerId) as
      | Answer
      | undefined
    if (
      user.id === contract.creatorId ||
      (answer && user.id === answer.loverUserId)
    ) {
      throw new APIError(403, 'You cannot bet on your own relationship market.')
    }
    const prob = getCpmmProbability(newPool, 0.5)
    if (prob < 0.02) {
      throw new APIError(
        403,
        'Minimum of 2% probability in relationship markets.'
      )
    }
  }
  // Special case for relationship markets. (Old markets.)
  if (contract.loverUserId1 && newPool) {
    if (contract.outcomeType === 'BINARY') {
      // Binary relationship markets deprecated.
      const prob = getCpmmProbability(newPool, newP ?? 0.5)
      if (prob < 0.01) {
        throw new APIError(
          403,
          'Minimum of 1% probability in relationship markets.'
        )
      }
    } else if (contract.outcomeType === 'MULTIPLE_CHOICE') {
      const prob = getCpmmProbability(newPool, 0.5)
      if (prob < 0.05) {
        throw new APIError(
          403,
          'Minimum of 5% probability in relationship markets.'
        )
      }
    }
  }

  const candidateBet = removeUndefinedProps({
    userId: user.id,
    isApi,
    replyToCommentId,
    betGroupId,
    ...newBet,
  })
  const betRow = await insertBet(candidateBet, pgTrans)
  fullBets.push(convertBet(betRow))
  log(`Inserted bet for ${user.username} - auth ${user.id}.`)

  if (makers) {
    await updateMakers(makers, betRow.bet_id, contract, pgTrans)
  }
  if (ordersToCancel) {
    await cancelLimitOrders(
      pgTrans,
      ordersToCancel.map((o) => o.id)
    )
    allOrdersToCancel.push(...ordersToCancel)
  }

  const apiFee = isApi ? FLAT_TRADE_FEE : 0
  await incrementBalance(pgTrans, user.id, {
    balance: -newBet.amount - apiFee,
  })
  log(`Updated user ${user.username} balance - auth ${user.id}.`)

  const totalCreatorFee =
    newBet.fees.creatorFee +
    sumBy(otherBetResults, (r) => r.bet.fees.creatorFee)
  if (totalCreatorFee !== 0) {
    await incrementBalance(pgTrans, contract.creatorId, {
      balance: totalCreatorFee,
      totalDeposits: totalCreatorFee,
    })

    log(
      `Updated creator ${
        contract.creatorUsername
      } with fee gain ${formatMoneyWithDecimals(totalCreatorFee)} - ${
        contract.creatorId
      }.`
    )
  }

  if (newBet.amount !== 0) {
    if (newBet.answerId) {
      // Multi-cpmm-1 contract
      if (newPool) {
        const { YES: poolYes, NO: poolNo } = newPool
        const prob = getCpmmProbability(newPool, 0.5)
        await updateAnswer(
          pgTrans,
          newBet.answerId,
          removeUndefinedProps({
            poolYes,
            poolNo,
            prob,
          })
        )
      }
    } else {
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
    }

    if (otherBetResults) {
      // TODO: do in a single query as a bulk update
      for (const result of otherBetResults) {
        const { answer, bet, cpmmState, makers, ordersToCancel } = result
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
          const betRow = await insertBet(candidateBet, pgTrans)
          fullBets.push(convertBet(betRow))
          const { YES: poolYes, NO: poolNo } = cpmmState.pool
          const prob = getCpmmProbability(cpmmState.pool, 0.5)
          await updateAnswer(
            pgTrans,
            answer.id,
            removeUndefinedProps({ poolYes, poolNo, prob })
          )
        }
        await updateMakers(makers, betRow.bet_id, contract, pgTrans)
        await cancelLimitOrders(
          pgTrans,
          ordersToCancel.map((o) => o.id)
        )

        allOrdersToCancel.push(...ordersToCancel)
      }
    }

    log(`Updated contract ${contract.slug} properties - auth ${user.id}.`)

    log('Redeeming shares for bettor', user.username, user.id)
    await redeemShares(pgTrans, user.id, contract)
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

export const validateBet = async (
  pgTrans: SupabaseTransaction | SupabaseDirectClient,
  uid: string,
  amount: number,
  contract: Contract,
  isApi: boolean
) => {
  const user = await getUser(uid, pgTrans)
  if (!user) throw new APIError(404, 'User not found.')

  if (user.balance < amount) throw new APIError(403, 'Insufficient balance.')
  if (
    (user.isBannedFromPosting || user.userDeleted) &&
    !BLESSED_BANNED_USER_IDS.includes(uid)
  ) {
    throw new APIError(403, 'You are banned or deleted. And not #blessed.')
  }
  // if (!isVerified(user)) {
  //   throw new APIError(403, 'You must verify your phone number to bet.')
  // }
  log(
    `Loaded user ${user.username} with id ${user.id} betting on slug ${contract.slug} with contract id: ${contract.id}.`
  )
  if (contract.outcomeType === 'STONK' && isApi) {
    throw new APIError(403, 'API users cannot bet on STONK contracts.')
  }
  log(
    `Loaded user ${user.username} with id ${user.id} betting on slug ${contract.slug} with contract id: ${contract.id}.`
  )

  return user
}

export type maker = {
  bet: LimitBet
  amount: number
  shares: number
  timestamp: number
}
export const updateMakers = async (
  makers: maker[],
  takerBetId: string,
  contract: MarketContract,
  pgTrans: SupabaseTransaction
) => {
  const updatedLimitBets: LimitBet[] = []
  // TODO: do this in a single query as a bulk update
  const makersByBet = groupBy(makers, (maker) => maker.bet.id)
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

    log('Update a matched limit order.')
    const newData = await pgTrans.one<LimitBet>(
      `update contract_bets
      set data = data || $1
      where bet_id = $2
      returning data`,
      [
        JSON.stringify({
          fills,
          isFilled,
          amount: totalAmount,
          shares: totalShares,
        }),
        bet.id,
      ],
      (r) => r.data
    )

    updatedLimitBets.push(newData)
  }

  broadcastOrders(updatedLimitBets)

  // Deduct balance of makers.
  const spentByUser = mapValues(
    groupBy(makers, (maker) => maker.bet.userId),
    (makers) => sumBy(makers, (maker) => maker.amount)
  )

  await bulkIncrementBalances(
    pgTrans,
    Object.entries(spentByUser).map(([userId, spent]) => ({
      id: userId,
      balance: -spent,
    }))
  )

  log('Redeeming shares for makers', Object.keys(spentByUser))
  await Promise.all(
    Object.keys(spentByUser).map((userId) =>
      redeemShares(pgTrans, userId, contract)
    )
  )

  // TODO: figure out LOGGING
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

const getMakerIdsFromBetResult = (result: NewBetResult) => {
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
