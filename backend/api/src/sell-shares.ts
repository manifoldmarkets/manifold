import { mapValues, groupBy, sumBy, isEqual } from 'lodash'
import { APIError, type APIHandler } from './helpers/endpoint'
import { MarketContract } from 'common/contract'
import { getCpmmMultiSellBetInfo, getCpmmSellBetInfo } from 'common/sell-bet'
import { floatingEqual, floatingLesserEqual } from 'common/util/math'
import {
  executeNewBetResult,
  fetchContractBetDataAndValidate,
  getMakerIdsFromBetResult,
  getUserBalances,
} from './place-bet'
import { onCreateBets } from 'api/on-create-bet'
import { log } from 'shared/utils'
import * as crypto from 'crypto'
import { runShortTrans } from 'shared/short-transaction'
import { convertBet } from 'common/supabase/bets'
import { betsQueue } from 'shared/helpers/fn-queue'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import { Bet, LimitBet } from 'common/bet'
import { Answer } from 'common/answer'

const fetchSellSharesDataAndValidate = async (
  pgTrans: SupabaseTransaction | SupabaseDirectClient,
  contractId: string,
  answerId: string | undefined,
  userId: string,
  isApi: boolean
) => {
  const userBetsPromise = pgTrans.map(
    `select * from contract_bets where user_id = $1
        and contract_id = $2
        ${answerId ? 'and answer_id = $3' : ''}
        order by created_time desc`,
    [userId, contractId, answerId],
    convertBet
  )
  const {
    user,
    contract,
    answers,
    balanceByUserId,
    unfilledBets,
    unfilledBetUserIds,
  } = await fetchContractBetDataAndValidate(
    pgTrans,
    {
      contractId,
      amount: undefined,
      answerId,
    },
    userId,
    isApi
  )
  const userBets = await userBetsPromise

  const { mechanism } = contract

  if (mechanism !== 'cpmm-1' && mechanism !== 'cpmm-multi-1')
    throw new APIError(
      403,
      'You can only sell shares on cpmm-1 or cpmm-multi-1 contracts'
    )

  return {
    user,
    contract,
    answers,
    balanceByUserId,
    unfilledBets,
    unfilledBetUserIds,
    userBets,
  }
}

const calculateSellResult = (
  contract: MarketContract,
  answers: Answer[] | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: Record<string, number>,
  answerId: string | undefined,
  outcome: 'YES' | 'NO' | undefined,
  shares: number | undefined,
  userBets: Bet[]
) => {
  const { mechanism } = contract

  const loanAmount = sumBy(userBets, (bet) => bet.loanAmount ?? 0)
  const betsByOutcome = groupBy(userBets, (bet) => bet.outcome)
  const sharesByOutcome = mapValues(betsByOutcome, (bets) =>
    sumBy(bets, (b) => b.shares)
  )

  let chosenOutcome: 'YES' | 'NO'
  if (outcome != null) {
    chosenOutcome = outcome
  } else {
    const nonzeroShares = Object.entries(sharesByOutcome).filter(
      ([_k, v]) => !floatingEqual(0, v)
    )
    if (nonzeroShares.length == 0) {
      throw new APIError(403, "You don't own any shares in this market.")
    }
    if (nonzeroShares.length > 1) {
      throw new APIError(
        400,
        `You own multiple kinds of shares, but did not specify which to sell.`
      )
    }
    chosenOutcome = nonzeroShares[0][0] as 'YES' | 'NO'
  }

  const maxShares = sharesByOutcome[chosenOutcome]
  const sharesToSell = shares ?? maxShares

  if (!maxShares)
    throw new APIError(
      403,
      `You don't have any ${chosenOutcome} shares to sell.`
    )

  if (!floatingLesserEqual(sharesToSell, maxShares))
    throw new APIError(400, `You can only sell up to ${maxShares} shares.`)

  const soldShares = Math.min(sharesToSell, maxShares)
  const saleFrac = soldShares / maxShares
  let loanPaid = saleFrac * loanAmount
  if (!isFinite(loanPaid)) loanPaid = 0

  let answer
  if (
    mechanism === 'cpmm-1' ||
    (mechanism === 'cpmm-multi-1' && !contract.shouldAnswersSumToOne)
  ) {
    if (answerId) {
      answer = answers?.find((a) => a.id === answerId)
      if (!answer) {
        throw new APIError(400, 'Could not find answer ' + answerId)
      }
      if (answer.resolution) {
        throw new APIError(403, 'Answer is resolved and cannot be bet on')
      }
    }
    return {
      otherBetResults: [],
      ...getCpmmSellBetInfo(
        soldShares,
        chosenOutcome,
        contract,
        unfilledBets,
        balanceByUserId,
        loanPaid,
        answer
      ),
    }
  } else {
    if (!answers) throw new APIError(404, 'Should have fetched answers...')

    const answer = answers.find((a) => a.id === answerId)
    if (!answer) throw new APIError(404, 'Answer not found')
    if (answers.length < 2)
      throw new APIError(
        403,
        'Cannot bet until at least two answers are added.'
      )

    return {
      newP: 0.5,
      ...getCpmmMultiSellBetInfo(
        contract,
        answers,
        answer,
        soldShares,
        chosenOutcome,
        undefined,
        unfilledBets,
        balanceByUserId,
        loanPaid
      ),
    }
  }
}

export const sellShares: APIHandler<'market/:contractId/sell'> = async (
  props,
  auth,
  req
) => {
  const userId = auth.uid
  const isApi = auth.creds.kind === 'key'
  const { contractId, shares, outcome, answerId } = props
  const pg = createSupabaseDirectClient()
  const { contract, answers, balanceByUserId, unfilledBets, userBets } =
    await fetchSellSharesDataAndValidate(
      pg,
      contractId,
      answerId,
      userId,
      isApi
    )
  const simulatedResult = calculateSellResult(
    contract,
    answers,
    unfilledBets,
    balanceByUserId,
    answerId,
    outcome,
    shares,
    userBets
  )
  const simulatedMakerIds = getMakerIdsFromBetResult(simulatedResult)
  const deps = [userId, contractId, ...simulatedMakerIds]

  return await betsQueue.enqueueFn(() => sellSharesMain(props, auth, req), deps)
}

const sellSharesMain: APIHandler<'market/:contractId/sell'> = async (
  props,
  auth
) => {
  const { contractId, shares, outcome, answerId, deterministic } = props
  const userId = auth.uid
  const isApi = auth.creds.kind === 'key'
  const pg = createSupabaseDirectClient()

  const {
    user,
    contract,
    answers,
    balanceByUserId,
    unfilledBets,
    userBets,
    unfilledBetUserIds,
  } = await fetchSellSharesDataAndValidate(
    pg,
    contractId,
    answerId,
    userId,
    isApi
  )
  const simulatedResult = calculateSellResult(
    contract,
    answers,
    unfilledBets,
    balanceByUserId,
    answerId,
    outcome,
    shares,
    userBets
  )
  const simulatedMakerIds = getMakerIdsFromBetResult(simulatedResult)

  const result = await runShortTrans(async (pgTrans) => {
    log(
      `Inside main transaction sellshares for user ${userId} on contract id ${contractId}.`
    )

    // Refetch just user balances in transaction, since queue only enforces contract and bets not changing.
    const balanceByUserId = await getUserBalances(
      pgTrans,
      [
        userId,
        ...simulatedMakerIds, // Fetch just the makers that matched in the simulation.
      ],
      contract.token
    )
    user.balance = balanceByUserId[userId]

    for (const userId of unfilledBetUserIds) {
      if (!(userId in balanceByUserId)) {
        // Assume other makers have infinite balance since they are not involved in this bet.
        balanceByUserId[userId] = Number.MAX_SAFE_INTEGER
      }
    }

    const newBetResult = calculateSellResult(
      contract,
      answers,
      unfilledBets,
      balanceByUserId,
      answerId,
      outcome,
      shares,
      userBets
    )
    log(`Calculated sale information for ${user.username} - auth ${userId}.`)

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

    const betGroupId = crypto.randomBytes(12).toString('hex')

    return await executeNewBetResult(
      pgTrans,
      newBetResult,
      contract,
      user,
      isApi,
      undefined,
      betGroupId,
      deterministic
    )
  })

  const {
    newBet,
    betId,
    makers,
    fullBets,
    allOrdersToCancel,
    streakIncremented,
  } = result

  const continuation = async () => {
    await onCreateBets(
      fullBets,
      contract,
      user,
      allOrdersToCancel,
      makers,
      streakIncremented
    )
  }
  return { result: { ...newBet, betId }, continue: continuation }
}
