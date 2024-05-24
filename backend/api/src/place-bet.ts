import * as admin from 'firebase-admin'
import { DocumentReference, Transaction } from 'firebase-admin/firestore'
import { groupBy, mapValues, sumBy, uniq } from 'lodash'
import { APIError, type APIHandler } from './helpers/endpoint'
import { Contract, CPMM_MIN_POOL_QTY } from 'common/contract'
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
import { getUser, getUsers, log, metrics } from 'shared/utils'
import { Answer } from 'common/answer'
import { CpmmState, getCpmmProbability } from 'common/calculate-cpmm'
import { ValidatedAPIParams } from 'common/api/schema'
import { onCreateBets } from 'api/on-create-bet'
import { BLESSED_BANNED_USER_IDS } from 'common/envs/constants'
import * as crypto from 'crypto'
import { formatMoneyWithDecimals } from 'common/util/format'
import { SupabaseTransaction, pgp } from 'shared/supabase/init'
import { bulkIncrementBalances, incrementBalance } from 'shared/supabase/users'
import { runEvilTransaction } from 'shared/evil-transaction'
import { convertBet } from 'common/supabase/bets'
import {
  bulkInsertBets,
  cancelLimitOrders,
  insertBet,
} from 'shared/supabase/bets'

export const placeBet: APIHandler<'bet'> = async (props, auth) => {
  const isApi = auth.creds.kind === 'key'
  return await placeBetMain(props, auth.uid, isApi)
}

// Note: this returns a continuation function that should be run for consistency.
export const placeBetMain = async (
  body: ValidatedAPIParams<'bet'>,
  uid: string,
  isApi: boolean
) => {
  const { amount, contractId, replyToCommentId } = body

  const result = await runEvilTransaction(async (pgTrans, fbTrans) => {
    const { user, contract, contractDoc } = await validateBet(
      uid,
      amount,
      contractId,
      pgTrans,
      fbTrans,
      isApi
    )

    const { closeTime, outcomeType, mechanism } = contract
    if (closeTime && Date.now() > closeTime)
      throw new APIError(403, 'Trading is closed.')

    const newBetResult = await (async (): Promise<
      BetInfo & {
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
    > => {
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
          `Checking for limit orders in placebet for user ${uid} on contract id ${contractId}.`
        )
        const { unfilledBets, balanceByUserId } =
          await getUnfilledBetsAndUserBalances(pgTrans, contractDoc)

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
        if (!body.answerId) {
          throw new APIError(400, 'answerId must be specified for multi bets')
        }

        const { answerId, outcome, limitProb, expiresAt } = body
        if (expiresAt && expiresAt < Date.now())
          throw new APIError(403, 'Bet cannot expire in the past.')
        const answersSnap = await fbTrans.get(
          contractDoc.collection('answersCpmm')
        )
        const answers = answersSnap.docs.map((doc) => doc.data() as Answer)
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

        const { unfilledBets, balanceByUserId } =
          await getUnfilledBetsAndUserBalances(
            pgTrans,
            contractDoc,
            // Fetch all limit orders if answers should sum to one.
            shouldAnswersSumToOne ? undefined : answerId
          )

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
    })()
    log(`Calculated new bet information for ${user.username} - auth ${uid}.`)
    const betGroupId =
      mechanism === 'cpmm-multi-1' && contract.shouldAnswersSumToOne
        ? crypto.randomBytes(12).toString('hex')
        : undefined
    return processNewBetResult(
      newBetResult,
      contractDoc,
      contract,
      user,
      isApi,
      pgTrans,
      fbTrans,
      replyToCommentId,
      betGroupId
    )
  })

  const {
    newBet,
    fullBets,
    allOrdersToCancel,
    betId,
    contract,
    makers,
    user,
    betGroupId,
  } = result

  log(`Main transaction finished - auth ${uid}.`)
  metrics.inc('app/bet_count', { contract_id: contractId })

  const continuation = async () => {
    await onCreateBets(fullBets, contract, user, allOrdersToCancel, makers)
  }

  return {
    result: { ...newBet, betId, betGroupId },
    continue: continuation,
  }
}

const firestore = admin.firestore()

export const getUnfilledBetsAndUserBalances = async (
  pgTrans: SupabaseTransaction,
  contractDoc: DocumentReference,
  answerId?: string
) => {
  const unfilledBets = await pgTrans.map(
    `select * from contract_bets
    where contract_id = $1
    and (data->'isFilled')::boolean = false
    and (data->'isCancelled')::boolean = false
    ${answerId ? `and answer_id = $2` : ''}`,
    [contractDoc.id, answerId],
    (r) => convertBet(r) as LimitBet
  )

  // Get balance of all users with open limit orders.
  const userIds = uniq(unfilledBets.map((bet) => bet.userId))
  const users = userIds.length === 0 ? [] : await getUsers(userIds, pgTrans)

  const balanceByUserId = Object.fromEntries(
    users.map((user) => [user.id, user.balance])
  )

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

export const processNewBetResult = async (
  newBetResult: NewBetResult,
  contractDoc: DocumentReference,
  contract: Contract,
  user: User,
  isApi: boolean,
  pgTrans: SupabaseTransaction,
  fbTrans: Transaction,
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

  const fullBet = removeUndefinedProps({
    userId: user.id,
    isApi,
    replyToCommentId,
    betGroupId,
    ...newBet,
  })
  const { bet_id } = await insertBet(fullBet, pgTrans)

  log(`Inserted bet for ${user.username} - auth ${user.id}.`)

  if (makers) {
    await updateMakers([{ makers, takerBetId: bet_id }], pgTrans)
  }
  if (ordersToCancel) {
    await cancelLimitOrders(
      pgTrans,
      ordersToCancel.map((o) => o.id)
    )
    allOrdersToCancel.push(...ordersToCancel)
  }

  await incrementBalance(pgTrans, user.id, {
    balance: -newBet.amount,
  })
  log(`Updated user ${user.username} balance - auth ${user.id}.`)

  const totalCreatorFee =
    newBet.fees.creatorFee +
    sumBy(otherBetResults, (r) => r.bet.fees.creatorFee)
  if (totalCreatorFee !== 0) {
    await incrementBalance(pgTrans, contract.creatorId, {
      balance: totalCreatorFee,
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
        fbTrans.update(
          contractDoc.collection('answersCpmm').doc(newBet.answerId),
          removeUndefinedProps({
            poolYes,
            poolNo,
            prob,
          })
        )
      }
    } else {
      fbTrans.update(
        contractDoc,
        removeUndefinedProps({
          pool: newPool,
          p: newP,
          totalLiquidity: newTotalLiquidity,
        })
      )
    }

    if (otherBetResults) {
      const bets: Omit<Bet, 'id'>[] = []
      const allMakers = []
      for (const result of otherBetResults) {
        const { answer, bet, cpmmState, makers, ordersToCancel } = result
        allOrdersToCancel.push(...ordersToCancel)

        const { probBefore, probAfter } = bet
        const smallEnoughToIgnore =
          probBefore < 0.001 &&
          probAfter < 0.001 &&
          Math.abs(probAfter - probBefore) < 0.00001

        if (!smallEnoughToIgnore || Math.random() < 0.01) {
          const fullBet = removeUndefinedProps({
            userId: user.id,
            isApi,
            betGroupId,
            ...bet,
          })
          bets.push(fullBet)
          const { YES: poolYes, NO: poolNo } = cpmmState.pool
          const prob = getCpmmProbability(cpmmState.pool, 0.5)
          fbTrans.update(
            contractDoc.collection('answersCpmm').doc(answer.id),
            removeUndefinedProps({
              poolYes,
              poolNo,
              prob,
            })
          )
        }
        allMakers.push({ makers, takerBetId: bet_id })
      }

      await updateMakers(allMakers, pgTrans)
      const betRows = await bulkInsertBets(bets, pgTrans)
      fullBets.push(...betRows.map(convertBet))
    }

    log(`Updated contract ${contract.slug} properties - auth ${user.id}.`)
  }

  await cancelLimitOrders(
    pgTrans,
    allOrdersToCancel.map((o) => o.id)
  )

  return {
    newBet,
    betId: bet_id,
    contract,
    makers,
    allOrdersToCancel,
    fullBets,
    user,
    fullBet,
    betGroupId,
  }
}

export const validateBet = async (
  uid: string,
  amount: number,
  contractId: string,
  pgTrans: SupabaseTransaction,
  fbTrans: Transaction,
  isApi: boolean
) => {
  log(`Inside main transaction for ${uid}.`)
  const contractDoc = firestore.doc(`contracts/${contractId}`)
  const contractSnap = await fbTrans.get(contractDoc)
  if (!contractSnap.exists) throw new APIError(404, 'Contract not found.')
  const contract = contractSnap.data() as Contract

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

  return {
    user,
    contract,
    contractDoc,
  }
}

export type maker = {
  bet: LimitBet
  amount: number
  shares: number
  timestamp: number
}

export type AllMakers = {
  makers: maker[]
  takerBetId: string
}[]

export const updateMakers = async (
  allMakers: AllMakers,
  pgTrans: SupabaseTransaction
) => {
  const updates: any[] = []

  for (const { makers, takerBetId } of allMakers) {
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

      updates.push([
        {
          fills,
          isFilled,
          amount: totalAmount,
          shares: totalShares,
        },
        bet.id,
      ])
    }
  }

  // Deduct balance of makers.
  const values = updates.map((data, id) =>
    pgp.as.format(`($1, $2)`, [JSON.stringify(data), id])
  )

  await pgTrans.none(
    `update contract_bets c
    set c.data = c.data || v.data
    from (values ${values} as v(data, id))
    where bet_id = $2`
  )

  const spentByUser = mapValues(
    groupBy(
      allMakers.flatMap((a) => a.makers),
      (maker) => maker.bet.userId
    ),
    (makers) => sumBy(makers, (maker) => maker.amount)
  )

  await bulkIncrementBalances(
    pgTrans,
    Object.entries(spentByUser).map(([userId, spent]) => ({
      id: userId,
      balance: -spent,
    }))
  )
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
