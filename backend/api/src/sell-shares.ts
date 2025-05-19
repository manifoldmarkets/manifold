import { APIError, type APIHandler } from './helpers/endpoint'
import { MarketContract } from 'common/contract'
import { getCpmmMultiSellBetInfo, getCpmmSellBetInfo } from 'common/sell-bet'
import { floatingLesserEqual } from 'common/util/math'
import { executeNewBetResult } from './place-bet'
import { onCreateBets } from 'api/on-create-bet'
import { log } from 'shared/utils'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { betsQueue } from 'shared/helpers/fn-queue'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { LimitBet } from 'common/bet'
import { Answer } from 'common/answer'
import { ContractMetric } from 'common/contract-metric'
import {
  fetchContractBetDataAndValidate,
  getMakerIdsFromBetResult,
  validateMakerBalances,
  getUserBalancesAndMetrics,
} from 'api/helpers/bets'
import { randomString } from 'common/util/random'
import { isEqual } from 'lodash'

const calculateSellResult = (
  contract: MarketContract,
  answers: Answer[] | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: Record<string, number>,
  answerId: string | undefined,
  outcome: 'YES' | 'NO',
  shares: number | undefined,
  contractMetric: ContractMetric
) => {
  const { mechanism } = contract
  const { totalShares: sharesByOutcome, loan: loanAmount } = contractMetric

  const maxShares = sharesByOutcome[outcome]
  const sharesToSell = shares ?? maxShares

  if (!maxShares)
    throw new APIError(403, `You don't have any ${outcome} shares to sell.`)

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
        outcome,
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
        outcome,
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
  const { contractId, deps } = props
  const fullDeps = [userId, contractId, ...(deps ?? [])]
  return await betsQueue.enqueueFn(
    () => sellSharesMain(props, auth, req),
    fullDeps
  )
}

const sellSharesMain: APIHandler<'market/:contractId/sell'> = async (
  props,
  auth
) => {
  const { contractId, shares, outcome, answerId, deterministic } = props
  const uid = auth.uid
  const isApi = auth.creds.kind === 'key'
  const pg = createSupabaseDirectClient()
  const oppositeOutcome = outcome === 'YES' ? 'NO' : 'YES'
  const {
    user,
    contract,
    answers,
    balanceByUserId,
    unfilledBets,
    contractMetrics,
    unfilledBetUserIds,
  } = await fetchContractBetDataAndValidate(
    pg,
    { ...props, amount: undefined, outcome: oppositeOutcome },
    uid,
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

  const result = await runTransactionWithRetries(async (pgTrans) => {
    log(
      `Inside main transaction for user ${uid} selling ${shares} shares on contract id ${contractId}.`
    )
    const { balanceByUserId, contractMetrics } =
      await getUserBalancesAndMetrics(
        pgTrans,
        [uid, ...simulatedMakerIds], // Fetch just the makers that matched in the simulation.
        contract,
        answerId
      )
    user.balance = balanceByUserId[uid]

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
    log(`Calculated sale information for ${user.username} - auth ${uid}.`)
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

    validateMakerBalances(newBetResult, balanceByUserId)
    const betGroupId = randomString(12)

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

  const { newBet, betId } = result

  const continuation = async () => {
    await onCreateBets(result)
  }
  return { result: { ...newBet, betId }, continue: continuation }
}
