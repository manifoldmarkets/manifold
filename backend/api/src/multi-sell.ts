import * as crypto from 'crypto'
import { APIError, type APIHandler } from './helpers/endpoint'
import { onCreateBets } from 'api/on-create-bet'
import { executeNewBetResult } from 'api/place-bet'
import { getContract, getUser, log } from 'shared/utils'
import { groupBy, keyBy, mapValues, sumBy } from 'lodash'
import { getCpmmMultiSellSharesInfo } from 'common/sell-bet'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { convertBet } from 'common/supabase/bets'
import { betsQueue } from 'shared/helpers/fn-queue'
import { getContractMetrics } from 'shared/helpers/user-contract-metrics'
import { getUnfilledBetsAndUserBalances } from 'api/helpers/bets'
import { isSummary } from 'common/contract-metric'

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

    const loanAmountByAnswerId = mapValues(
      keyBy(
        allMyMetrics.filter((m) => !isSummary(m)),
        'answerId'
      ),
      (m) => m.loan ?? 0
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
        false
      )
      results.push(result)
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
