import { isEqual } from 'lodash'
import { APIError, type APIHandler } from './helpers/endpoint'
import { MarketContract } from 'common/contract'
import { getCpmmMultiSellBetInfo, getCpmmSellBetInfo } from 'common/sell-bet'
import { floatingEqual, floatingLesserEqual } from 'common/util/math'
import { executeNewBetResult } from './place-bet'
import { onCreateBets } from 'api/on-create-bet'
import { log } from 'shared/utils'
import * as crypto from 'crypto'
import { runShortTrans } from 'shared/short-transaction'
import { betsQueue } from 'shared/helpers/fn-queue'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import { LimitBet } from 'common/bet'
import { Answer } from 'common/answer'
import { ContractMetric } from 'common/contract-metric'
import {
  fetchContractBetDataAndValidate,
  getMakerIdsFromBetResult,
  getUserBalancesAndMetrics,
} from 'api/helpers/bets'

const fetchSellSharesDataAndValidate = async (
  pgTrans: SupabaseTransaction | SupabaseDirectClient,
  contractId: string,
  answerId: string | undefined,
  userId: string,
  isApi: boolean
) => {
  const res = await fetchContractBetDataAndValidate(
    pgTrans,
    {
      contractId,
      amount: undefined,
      answerId,
    },
    userId,
    isApi
  )
  const { contract } = res
  const { mechanism } = contract

  if (mechanism !== 'cpmm-1' && mechanism !== 'cpmm-multi-1')
    throw new APIError(
      403,
      'You can only sell shares on cpmm-1 or cpmm-multi-1 contracts'
    )

  return res
}

const calculateSellResult = (
  contract: MarketContract,
  answers: Answer[] | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: Record<string, number>,
  answerId: string | undefined,
  outcome: 'YES' | 'NO' | undefined,
  shares: number | undefined,
  contractMetric: ContractMetric
) => {
  const { mechanism } = contract
  const { totalShares: sharesByOutcome, loan: loanAmount } = contractMetric

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
  const { contract, answers, balanceByUserId, unfilledBets, contractMetrics } =
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
    contractMetrics.find(
      (m) => m.answerId == answerId && m.userId === auth.uid
    )!
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
    contractMetrics: staleMetrics,
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
    staleMetrics.find((m) => m.answerId == answerId && m.userId === auth.uid)!
  )
  const simulatedMakerIds = getMakerIdsFromBetResult(simulatedResult)

  const result = await runShortTrans(async (pgTrans) => {
    log(
      `Inside main transaction sellshares for user ${userId} on contract id ${contractId}.`
    )

    // Refetch just user balances in transaction, since queue only enforces contract and bets not changing.
    const { balanceByUserId, contractMetrics } =
      await getUserBalancesAndMetrics(
        pgTrans,
        [
          userId,
          ...simulatedMakerIds, // Fetch just the makers that matched in the simulation.
        ],
        contract,
        answerId
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
      contractMetrics.find(
        (m) => m.answerId == answerId && m.userId === auth.uid
      )!
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
      contractMetrics,
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
    updatedMetrics,
  } = result

  const continuation = async () => {
    await onCreateBets(
      fullBets,
      contract,
      user,
      allOrdersToCancel,
      makers,
      streakIncremented,
      undefined,
      updatedMetrics
    )
  }
  return { result: { ...newBet, betId }, continue: continuation }
}
