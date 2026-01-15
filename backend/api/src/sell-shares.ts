import {
  fetchContractBetDataAndValidate,
  getMakerIdsFromBetResult,
  getUserBalancesAndMetrics,
} from 'api/helpers/bets'
import { onCreateBets } from 'api/on-create-bet'
import { Answer } from 'common/answer'
import { LimitBet } from 'common/bet'
import { MS_PER_DAY } from 'common/loans'
import { MarketContract } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { getCpmmMultiSellBetInfo, getCpmmSellBetInfo } from 'common/sell-bet'
import { floatingLesserEqual } from 'common/util/math'
import { randomString } from 'common/util/random'
import { isEqual, keyBy } from 'lodash'
import { trackPublicAuditBetEvent } from 'shared/audit-events'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { betsQueue } from 'shared/helpers/fn-queue'
import {
  getLoanTrackingRows,
  upsertLoanTrackingQuery,
  LoanTrackingRow,
} from 'shared/helpers/user-contract-loans'
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
  const { totalShares: sharesByOutcome } = contractMetric
  // Include both free loans and margin loans in total loan amount
  const loanAmount =
    (contractMetric.loan ?? 0) + (contractMetric.marginLoan ?? 0)

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

    const userMetric = contractMetrics.find(
      (m) => m.answerId == answerId && m.userId === uid
    )!

    // Capture margin loan before selling for loan tracking update
    const marginLoanBefore = userMetric.marginLoan ?? 0

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

    // Update loan tracking if margin loan was repaid
    if (marginLoanBefore > 0) {
      const now = Date.now()
      const loanTracking = await getLoanTrackingRows(pgTrans, uid, [contractId])
      const trackingKey = `${contractId}-${answerId ?? ''}`
      const trackingByKey = keyBy(
        loanTracking,
        (t) => `${t.contract_id}-${t.answer_id ?? ''}`
      )
      const tracking = trackingByKey[trackingKey]

      // Calculate loan repayment from the bet
      const loanRepayment = -(newBetResult.newBet.loanAmount ?? 0)
      if (loanRepayment > 0) {
        // Calculate how much of the repayment went to margin loan (proportional split)
        const totalLoanBefore =
          (userMetric.loan ?? 0) + (userMetric.marginLoan ?? 0)
        const marginLoanRatio =
          totalLoanBefore > 0 ? marginLoanBefore / totalLoanBefore : 0
        const marginLoanRepaid = loanRepayment * marginLoanRatio

        if (marginLoanRepaid > 0) {
          // Finalize the integral up to now
          const lastUpdate = tracking?.last_loan_update_time ?? now
          const daysSinceLastUpdate = (now - lastUpdate) / MS_PER_DAY
          const finalIntegral =
            (tracking?.loan_day_integral ?? 0) +
            marginLoanBefore * daysSinceLastUpdate

          // Reduce integral proportionally based on repayment
          const repaymentRatio = Math.min(
            1,
            marginLoanRepaid / marginLoanBefore
          )
          const newIntegral = finalIntegral * (1 - repaymentRatio)

          const loanTrackingUpdate: Omit<LoanTrackingRow, 'id'>[] = [
            {
              user_id: uid,
              contract_id: contractId,
              answer_id: answerId ?? null,
              loan_day_integral: Math.max(0, newIntegral),
              last_loan_update_time: now,
            },
          ]
          await pgTrans.none(upsertLoanTrackingQuery(loanTrackingUpdate))
          log(
            `Updated loan tracking for ${uid} on ${contractId}: integral ${
              tracking?.loan_day_integral ?? 0
            } -> ${newIntegral}`
          )
        }
      }
    }

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
