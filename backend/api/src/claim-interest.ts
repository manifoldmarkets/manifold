import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getContract, getUser, log } from 'shared/utils'
import { calculateInterestShares } from 'shared/calculate-interest-shares'
import { Bet } from 'common/bet'
import { removeUndefinedProps } from 'common/util/object'
import { noFees } from 'common/fees'
import { insertBet } from 'shared/supabase/bets'
import { getContractMetrics } from 'shared/helpers/user-contract-metrics'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { betsQueue } from 'shared/helpers/fn-queue'

export const claimInterest: APIHandler<'claim-interest'> = async (
  props,
  auth
) => {
  const { contractId, answerId } = props
  const userId = auth.uid

  return await betsQueue.enqueueFn(
    () => claimInterestMain(contractId, userId, answerId),
    [userId, contractId]
  )
}

const claimInterestMain = async (
  contractId: string,
  userId: string,
  answerId?: string
) => {
  const pg = createSupabaseDirectClient()

  const result = await runTransactionWithRetries(async (pgTrans) => {
    const [user, contract] = await Promise.all([
      getUser(userId, pgTrans),
      getContract(pgTrans, contractId),
    ])

    if (!user) throw new APIError(404, 'User not found')
    if (!contract) throw new APIError(404, 'Contract not found')

    if (contract.isResolved) {
      throw new APIError(400, 'Cannot claim interest on resolved contract')
    }

    // Calculate claimable interest shares
    const interestResult = await calculateInterestShares(
      pgTrans,
      contractId,
      userId,
      answerId,
      Date.now(),
      contract.token
    )

    const { yesShares, noShares } = interestResult

    if (yesShares <= 0 && noShares <= 0) {
      return { claimedYesShares: 0, claimedNoShares: 0 }
    }

    // Get contract metrics for the bet insert
    const contractMetrics = await getContractMetrics(
      pgTrans,
      [userId],
      contractId,
      answerId ? [answerId] : [],
      !answerId // includeNullAnswer if no specific answerId
    )

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

    // Create interest claim bet for YES shares if any
    if (yesShares > 0) {
      const yesBet: Omit<Bet, 'id'> = removeUndefinedProps({
        contractId,
        userId,
        answerId,
        createdTime: Date.now(),
        amount: 0, // No mana spent
        shares: yesShares,
        outcome: 'YES',
        probBefore: prob,
        probAfter: prob, // No price impact
        fees: noFees,
        isRedemption: false,
        isInterestClaim: true,
      })

      await insertBet(yesBet, pgTrans, contractMetrics)

      log(`Created YES interest claim bet for user ${userId}`, {
        shares: yesShares,
        contractId,
        answerId,
      })
    }

    // Create interest claim bet for NO shares if any
    if (noShares > 0) {
      const noBet: Omit<Bet, 'id'> = removeUndefinedProps({
        contractId,
        userId,
        answerId,
        createdTime: Date.now(),
        amount: 0, // No mana spent
        shares: noShares,
        outcome: 'NO',
        probBefore: prob,
        probAfter: prob, // No price impact
        fees: noFees,
        isRedemption: false,
        isInterestClaim: true,
      })

      await insertBet(noBet, pgTrans, contractMetrics)

      log(`Created NO interest claim bet for user ${userId}`, {
        shares: noShares,
        contractId,
        answerId,
      })
    }

    return {
      claimedYesShares: yesShares,
      claimedNoShares: noShares,
    }
  })

  return result
}
