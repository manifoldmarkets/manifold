import * as crypto from 'crypto'
import { APIError, type APIHandler } from './helpers/endpoint'
import { getNewMultiCpmmBetsInfo } from 'common/new-bet'
import { ValidatedAPIParams } from 'common/api/schema'
import { onCreateBets } from 'api/on-create-bet'
import {
  getRoundedLimitProb,
  getUnfilledBetsAndUserBalances,
  processNewBetResult,
  validateBet,
} from 'api/place-bet'
import { getContract, log } from 'shared/utils'
import { runShortTrans } from 'shared/short-transaction'
import { betsQueue } from 'shared/helpers/fn-queue'
import { getAnswersForContract } from 'shared/supabase/answers'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const placeMultiBet: APIHandler<'multi-bet'> = async (props, auth) => {
  const isApi = auth.creds.kind === 'key'
  return await betsQueue.enqueueFn(
    () => placeMultiBetMain(props, auth.uid, isApi),
    [props.contractId, auth.uid]
  )
}

// Note: this returns a continuation function that should be run for consistency.
export const placeMultiBetMain = async (
  body: ValidatedAPIParams<'multi-bet'>,
  uid: string,
  isApi: boolean
) => {
  const { amount, contractId } = body
  const pg = createSupabaseDirectClient()
  const contract = await getContract(pg, contractId)
  if (!contract) throw new APIError(404, 'Contract not found.')

  const results = await runShortTrans(async (pgTrans) => {
    const user = await validateBet(uid, amount, contract, pgTrans, isApi)

    const { closeTime, mechanism } = contract
    if (closeTime && Date.now() > closeTime)
      throw new APIError(403, 'Trading is closed.')

    if (mechanism != 'cpmm-multi-1' || !('shouldAnswersSumToOne' in contract)) {
      throw new APIError(400, 'Contract type/mechanism not supported')
    }
    const { shouldAnswersSumToOne } = contract
    const { answerIds, limitProb, expiresAt } = body
    if (expiresAt && expiresAt < Date.now())
      throw new APIError(403, 'Bet cannot expire in the past.')

    const answers = await getAnswersForContract(pgTrans, contract.id)
    const betOnAnswers = answers.filter((a) => answerIds.includes(a.id))
    if (!betOnAnswers) throw new APIError(404, 'Answers not found')
    if ('resolution' in betOnAnswers && betOnAnswers.resolution)
      throw new APIError(403, 'Answer is resolved and cannot be bet on')
    if (shouldAnswersSumToOne && answers.length < 2)
      throw new APIError(
        403,
        'Cannot bet until at least two answers are added.'
      )

    const roundedLimitProb = getRoundedLimitProb(limitProb)
    const unfilledBetsAndBalances = await Promise.all(
      answerIds.map(
        async (answerId) =>
          await getUnfilledBetsAndUserBalances(pgTrans, contractId, answerId)
      )
    )
    const unfilledBets = unfilledBetsAndBalances.flatMap((b) => b.unfilledBets)
    let balancesByUserId: Record<string, number> = {}
    unfilledBetsAndBalances.forEach((b) => {
      balancesByUserId = { ...balancesByUserId, ...b.balanceByUserId }
    })

    const newBetResults = getNewMultiCpmmBetsInfo(
      contract,
      answers,
      betOnAnswers,
      'YES',
      amount,
      roundedLimitProb,
      unfilledBets,
      balancesByUserId,
      expiresAt
    )

    log(`Calculated new bet information for ${user.username} - auth ${uid}.`)
    const betGroupId = crypto.randomBytes(12).toString('hex')
    return await Promise.all(
      newBetResults.map((newBetResult) =>
        processNewBetResult(
          newBetResult,
          contract,
          user,
          isApi,
          pgTrans,
          undefined,
          betGroupId
        )
      )
    )
  })

  log(`Main transaction finished - auth ${uid}.`)

  const continuation = async () => {
    const fullBets = results.flatMap((result) => result.fullBets)
    const allOrdersToCancel = results.flatMap(
      (result) => result.allOrdersToCancel
    )
    const makers = results.flatMap((result) => result.makers ?? [])
    const user = results[0].user
    await onCreateBets(fullBets, contract, user, allOrdersToCancel, makers)
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
