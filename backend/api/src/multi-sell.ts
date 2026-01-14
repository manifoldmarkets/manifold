import { getUnfilledBetsAndUserBalances } from 'api/helpers/bets'
import { onCreateBets } from 'api/on-create-bet'
import { executeNewBetResult } from 'api/place-bet'
import { CPMMMultiContract } from 'common/contract'
import { isSummary } from 'common/contract-metric'
import { MS_PER_DAY } from 'common/loans'
import { getCpmmMultiSellSharesInfo } from 'common/sell-bet'
import { convertBet } from 'common/supabase/bets'
import * as crypto from 'crypto'
import { groupBy, keyBy, mapValues, sumBy } from 'lodash'
import { calculatePoolInterestMulti } from 'shared/calculate-pool-interest'
import { betsQueue } from 'shared/helpers/fn-queue'
import { getContractMetrics } from 'shared/helpers/user-contract-metrics'
import {
  getLoanTrackingRows,
  upsertLoanTrackingQuery,
  LoanTrackingRow,
} from 'shared/helpers/user-contract-loans'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { getContract, getUser, log } from 'shared/utils'
import { APIError, type APIHandler } from './helpers/endpoint'

export const multiSell: APIHandler<'multi-sell'> = async (props, auth, req) => {
  return await betsQueue.enqueueFn(
    () => multiSellMain(props, auth, req),
    [props.contractId, auth.uid]
  )
}

const multiSellMain: APIHandler<'multi-sell'> = async (props, auth) => {
  const { contractId, answerIds, deterministic } = props
  const { uid } = auth
  const isApi = auth.creds.kind === 'key'

  const user = await getUser(uid)
  if (!user) throw new APIError(401, 'Your account was not found')

  const results = await runTransactionWithRetries(async (pgTrans) => {
    const contract = await getContract(pgTrans, contractId)
    if (!contract) throw new APIError(404, 'Contract not found')
    const { closeTime, isResolved, mechanism } = contract
    if (closeTime && Date.now() > closeTime)
      throw new APIError(403, 'Trading is closed.')
    if (isResolved) throw new APIError(403, 'Market is resolved.')
    if (mechanism != 'cpmm-multi-1' || !('shouldAnswersSumToOne' in contract))
      throw new APIError(400, 'Contract type/mechanism not supported')

    // Calculate pool with interest and update local objects before sell calculations
    const poolUpdates = calculatePoolInterestMulti(
      contract as CPMMMultiContract,
      contract.answers
    )
    const updateMap = new Map(poolUpdates.map((u) => [u.id, u]))
    for (const answer of contract.answers) {
      const update = updateMap.get(answer.id)
      if (update) {
        answer.poolYes = update.poolYes
        answer.poolNo = update.poolNo
      }
    }

    const answersToSell = contract.answers.filter((a) =>
      answerIds.includes(a.id)
    )
    if (!answersToSell) throw new APIError(404, 'Answers not found')

    const unfilledBetsAndBalances = await Promise.all(
      answersToSell.map((answer) =>
        getUnfilledBetsAndUserBalances(pgTrans, contract, uid, answer.id)
      )
    )
    const unfilledBets = unfilledBetsAndBalances.flatMap((b) => b.unfilledBets)
    let balancesByUserId: Record<string, number> = {}
    unfilledBetsAndBalances.forEach((b) => {
      balancesByUserId = { ...balancesByUserId, ...b.balanceByUserId }
    })
    const allMyMetrics = await getContractMetrics(
      pgTrans,
      [uid],
      contractId,
      contract.answers.map((a) => a.id),
      true
    )
    const contractMetrics = [
      ...(unfilledBetsAndBalances.flatMap((b) => b.contractMetrics) ?? []),
      ...allMyMetrics,
    ]

    const userBets = await pgTrans.map(
      `select * from contract_bets
        where user_id = $1 and contract_id = $2 and answer_id in ($3:list)`,
      [uid, contractId, answersToSell.map((a) => a.id)],
      convertBet
    )

    // Capture margin loan amounts before selling for loan tracking update
    const marginLoanByAnswerId = mapValues(
      keyBy(
        allMyMetrics.filter((m) => !isSummary(m)),
        'answerId'
      ),
      (m) => m.marginLoan ?? 0
    )
    const freeLoanByAnswerId = mapValues(
      keyBy(
        allMyMetrics.filter((m) => !isSummary(m)),
        'answerId'
      ),
      (m) => m.loan ?? 0
    )
    const loanAmountByAnswerId = mapValues(
      keyBy(
        allMyMetrics.filter((m) => !isSummary(m)),
        'answerId'
      ),
      // Include both free loans and margin loans
      (m) => (m.loan ?? 0) + (m.marginLoan ?? 0)
    )

    const nonRedemptionBetsByAnswerId = groupBy(
      userBets.filter((bet) => bet.shares !== 0),
      (bet) => bet.answerId
    )
    const sharesByAnswerId = mapValues(nonRedemptionBetsByAnswerId, (bets) =>
      sumBy(bets, (b) => b.shares)
    )
    const minShares = Math.min(...Object.values(sharesByAnswerId))

    if (minShares === 0)
      throw new APIError(
        400,
        `You specified an answer to sell in which you have 0 shares.`
      )

    const betResults = getCpmmMultiSellSharesInfo(
      contract,
      nonRedemptionBetsByAnswerId,
      unfilledBets,
      balancesByUserId,
      loanAmountByAnswerId
    )
    const results = []
    log(`Calculated new bet information for ${user.username} - auth ${uid}.`)
    const betGroupId = crypto.randomBytes(12).toString('hex')
    for (const newBetResult of betResults) {
      const result = await executeNewBetResult(
        pgTrans,
        newBetResult,
        contract,
        user,
        isApi,
        contractMetrics,
        balancesByUserId,
        undefined,
        betGroupId,
        deterministic,
        false,
        false,
        true
      )
      results.push(result)
    }

    // Update loan tracking for any margin loans that were repaid
    const now = Date.now()
    const answersWithMarginLoans = answersToSell.filter(
      (a) => (marginLoanByAnswerId[a.id] ?? 0) > 0
    )
    if (answersWithMarginLoans.length > 0) {
      const loanTracking = await getLoanTrackingRows(pgTrans, uid, [contractId])
      const trackingByKey = keyBy(
        loanTracking,
        (t) => `${t.contract_id}-${t.answer_id ?? ''}`
      )

      const loanTrackingUpdates: Omit<LoanTrackingRow, 'id'>[] = []

      for (const answer of answersWithMarginLoans) {
        const marginLoanBefore = marginLoanByAnswerId[answer.id] ?? 0
        if (marginLoanBefore <= 0) continue

        const totalLoanBefore =
          (freeLoanByAnswerId[answer.id] ?? 0) + marginLoanBefore

        // Find the bet result for this answer to get loan repayment
        const answerBetResult = betResults.find(
          (br) => br.newBet.answerId === answer.id
        )
        if (!answerBetResult) continue

        const loanRepayment = -(answerBetResult.newBet.loanAmount ?? 0)
        if (loanRepayment <= 0) continue

        // Calculate how much went to margin loan (proportional split)
        const marginLoanRatio =
          totalLoanBefore > 0 ? marginLoanBefore / totalLoanBefore : 0
        const marginLoanRepaid = loanRepayment * marginLoanRatio

        if (marginLoanRepaid > 0) {
          const trackingKey = `${contractId}-${answer.id}`
          const tracking = trackingByKey[trackingKey]

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

          loanTrackingUpdates.push({
            user_id: uid,
            contract_id: contractId,
            answer_id: answer.id,
            loan_day_integral: Math.max(0, newIntegral),
            last_loan_update_time: now,
          })
        }
      }

      if (loanTrackingUpdates.length > 0) {
        await pgTrans.none(upsertLoanTrackingQuery(loanTrackingUpdates))
        log(
          `Updated loan tracking for ${uid} on ${contractId} for ${loanTrackingUpdates.length} answers`
        )
      }
    }

    return results
  })

  log(`Main transaction finished - auth ${uid}.`)

  const continuation = async () => {
    const fullBets = results.flatMap((result) => result.fullBets)
    const updatedMakers = results.flatMap((result) => result.updatedMakers)
    const cancelledLimitOrders = results.flatMap(
      (result) => result.cancelledLimitOrders
    )
    const makers = results.flatMap((result) => result.makers ?? [])
    const user = results[0].user
    await onCreateBets({
      fullBets,
      contract: results[0].contract,
      user,
      cancelledLimitOrders,
      makers,
      streakIncremented: results.some((b) => b.streakIncremented),
      bonusTxn: results.find((r) => r.bonusTxn)?.bonusTxn,
      reloadMetrics: true,
      updatedMetrics: [],
      userUpdates: undefined,
      contractUpdate: undefined,
      answerUpdates: undefined,
      updatedMakers,
    })
  }

  return {
    result: results.map((result) => ({
      ...result.newBet,
      betId: result.betId,
      betGroupId: result.betGroupId,
    })),
    continue: continuation,
  }
}
