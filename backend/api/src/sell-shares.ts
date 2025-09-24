import {
  fetchContractBetDataAndValidate,
  getMakerIdsFromBetResult,
  getUserBalancesAndMetrics,
} from 'api/helpers/bets'
import { onCreateBets } from 'api/on-create-bet'
import { Answer } from 'common/answer'
import { LimitBet } from 'common/bet'
import { MarketContract } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { getCpmmMultiSellBetInfo, getCpmmSellBetInfo } from 'common/sell-bet'
import { floatingLesserEqual } from 'common/util/math'
import { randomString } from 'common/util/random'
import { isEqual } from 'lodash'
import { trackPublicAuditBetEvent } from 'shared/audit-events'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { betsQueue } from 'shared/helpers/fn-queue'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { log } from 'shared/utils'
import { APIError, type APIHandler } from './helpers/endpoint'
import { executeNewBetResult } from './place-bet'

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
  const { contractId, deps, sellForUserId } = props
  // Check admin permissions when selling for another user
  if (sellForUserId) {
    throwErrorIfNotAdmin(auth.uid)
  }
  const userId = sellForUserId || auth.uid
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
  const {
    contractId,
    shares,
    outcome,
    answerId,
    deterministic,
    sellForUserId,
  } = props
  const uid = sellForUserId || auth.uid
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
    isApi,
    !!sellForUserId
  )
  const simulatedResult = calculateSellResult(
    contract,
    answers,
    unfilledBets,
    balanceByUserId,
    answerId,
    outcome,
    shares,
    contractMetrics.find((m) => m.answerId == answerId && m.userId === uid)!
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
      contractMetrics.find((m) => m.answerId == answerId && m.userId === uid)!
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
    const betGroupId = randomString(12)
    return await executeNewBetResult(
      pgTrans,
      newBetResult,
      contract,
      user,
      isApi,
      contractMetrics,
      balanceByUserId,
      undefined,
      betGroupId,
      deterministic
    )
  })

  const { newBet, betId } = result
  trackPublicAuditBetEvent(
    auth.uid,
    'admin_sell_shares',
    props.contractId,
    betId,
    {
      sellForUserId,
    }
  )

  const continuation = async () => {
    await onCreateBets(result)
  }
  return { result: { ...newBet, betId }, continue: continuation }
}
