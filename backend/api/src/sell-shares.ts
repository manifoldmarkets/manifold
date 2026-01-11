import {
  fetchContractBetDataAndValidate,
  getMakerIdsFromBetResult,
  getUserBalancesAndMetrics,
} from 'api/helpers/bets'
import { onCreateBets } from 'api/on-create-bet'
import { Answer } from 'common/answer'
import { Bet, LimitBet } from 'common/bet'
import { MarketContract } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { noFees } from 'common/fees'
import { getCpmmMultiSellBetInfo, getCpmmSellBetInfo } from 'common/sell-bet'
import { floatingLesserEqual } from 'common/util/math'
import { removeUndefinedProps } from 'common/util/object'
import { randomString } from 'common/util/random'
import { isEqual } from 'lodash'
import { trackPublicAuditBetEvent } from 'shared/audit-events'
import { calculateInterestShares } from 'shared/calculate-interest-shares'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { betsQueue } from 'shared/helpers/fn-queue'
import { createSupabaseDirectClient, SupabaseTransaction } from 'shared/supabase/init'
import { insertBet } from 'shared/supabase/bets'
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

    // Find user's contract metric and calculate interest
    const userMetric = contractMetrics.find(
      (m) => m.answerId == answerId && m.userId === uid
    )!

    // Calculate claimable interest shares
    const interestResult = await calculateInterestShares(
      pgTrans,
      contractId,
      uid,
      answerId,
      Date.now(),
      contract.token
    )

    // Get effective shares (base + interest)
    const baseShares = userMetric.totalShares[outcome] ?? 0
    const interestShares =
      outcome === 'YES' ? interestResult.yesShares : interestResult.noShares
    const effectiveMaxShares = baseShares + interestShares

    // If selling more than base shares, we need to auto-claim interest first
    const sharesToSell = shares ?? effectiveMaxShares
    const needsInterestClaim = sharesToSell > baseShares && interestShares > 0

    if (needsInterestClaim) {
      // Claim the necessary interest shares
      await autoClaimInterestForSell(
        pgTrans,
        contractId,
        uid,
        answerId,
        interestResult,
        contractMetrics,
        contract
      )

      // Update the contract metric to reflect the claimed interest
      userMetric.totalShares[outcome] = effectiveMaxShares
    }

    const newBetResult = calculateSellResult(
      contract,
      answers,
      unfilledBets,
      balanceByUserId,
      answerId,
      outcome,
      shares,
      userMetric
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
    const betResult = await executeNewBetResult(
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

    return betResult
  })

  const { newBet, betId } = result
  if (sellForUserId) {
    trackPublicAuditBetEvent(
      auth.uid,
      'admin_sell_shares',
      props.contractId,
      betId,
      {
        sellForUserId,
      }
    )
  }

  const continuation = async () => {
    await onCreateBets(result)
  }
  return { result: { ...newBet, betId }, continue: continuation }
}

/**
 * Auto-claim interest shares when user is selling more than their base shares.
 * This creates interest claim bets to convert accrued interest into actual shares.
 */
async function autoClaimInterestForSell(
  pgTrans: SupabaseTransaction,
  contractId: string,
  userId: string,
  answerId: string | undefined,
  interestResult: { yesShares: number; noShares: number },
  contractMetrics: ContractMetric[],
  contract: MarketContract
) {
  // Get current probability for the bet record
  let prob: number
  if (contract.mechanism === 'cpmm-1') {
    prob = contract.prob
  } else if (contract.mechanism === 'cpmm-multi-1' && answerId) {
    const answer = contract.answers?.find((a) => a.id === answerId)
    prob = answer?.prob ?? 0.5
  } else {
    prob = 0.5
  }

  // Claim YES interest shares if any
  if (interestResult.yesShares > 0) {
    const yesBet: Omit<Bet, 'id'> = removeUndefinedProps({
      contractId,
      userId,
      answerId,
      createdTime: Date.now(),
      amount: 0,
      shares: interestResult.yesShares,
      outcome: 'YES',
      probBefore: prob,
      probAfter: prob,
      fees: noFees,
      isRedemption: false,
      isInterestClaim: true,
    })

    await insertBet(yesBet, pgTrans, contractMetrics)
    log(`Auto-claimed ${interestResult.yesShares} YES interest shares for sell`)
  }

  // Claim NO interest shares if any
  if (interestResult.noShares > 0) {
    const noBet: Omit<Bet, 'id'> = removeUndefinedProps({
      contractId,
      userId,
      answerId,
      createdTime: Date.now(),
      amount: 0,
      shares: interestResult.noShares,
      outcome: 'NO',
      probBefore: prob,
      probAfter: prob,
      fees: noFees,
      isRedemption: false,
      isInterestClaim: true,
    })

    await insertBet(noBet, pgTrans, contractMetrics)
    log(`Auto-claimed ${interestResult.noShares} NO interest shares for sell`)
  }
}
