import { APIError, type APIHandler } from './helpers/endpoint'
import { MarketContract } from 'common/contract'
import { getCpmmMultiSellBetInfo, getCpmmSellBetInfo } from 'common/sell-bet'
import { floatingEqual, floatingLesserEqual } from 'common/util/math'
import { executeNewBetResult } from './place-bet'
import { onCreateBets } from 'api/on-create-bet'
import { log } from 'shared/utils'
import { runTransactionWithRetries } from 'shared/transaction-with-retries'
import { betsQueue } from 'shared/helpers/fn-queue'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { LimitBet } from 'common/bet'
import { Answer } from 'common/answer'
import { ContractMetric } from 'common/contract-metric'
import { fetchContractBetDataAndValidate } from 'api/helpers/bets'
import { randomString } from 'common/util/random'

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
  const userId = auth.uid
  const isApi = auth.creds.kind === 'key'
  const pg = createSupabaseDirectClient()
  const oppositeOutcome = outcome === 'YES' ? 'NO' : 'YES'

  const result = await runTransactionWithRetries(async (pgTrans) => {
    log(
      `Inside main transaction sellshares for user ${userId} on contract id ${contractId}.`
    )
    const {
      user,
      contract,
      answers,
      balanceByUserId,
      unfilledBets,
      contractMetrics,
    } = await fetchContractBetDataAndValidate(
      pg,
      { ...props, amount: undefined, outcome: oppositeOutcome },
      userId,
      isApi
    )

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

  const {
    newBet,
    betId,
    makers,
    fullBets,
    allOrdersToCancel,
    streakIncremented,
    updatedMetrics,
    user,
    contract,
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
