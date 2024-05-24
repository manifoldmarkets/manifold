import { APIError, type APIHandler } from './helpers/endpoint'
import { getNewMultiCpmmBetsInfo } from 'common/new-bet'
import { Answer } from 'common/answer'
import { ValidatedAPIParams } from 'common/api/schema'
import { onCreateBets } from 'api/on-create-bet'
import {
  getRoundedLimitProb,
  getUnfilledBetsAndUserBalances,
  processNewBetResult,
  validateBet,
} from 'api/place-bet'
import { log } from 'shared/utils'
import * as crypto from 'crypto'
import { runEvilTransaction } from 'shared/evil-transaction'

export const placeMultiBet: APIHandler<'multi-bet'> = async (props, auth) => {
  throw new APIError(500, 'This endpoint is disabled.')
}

// Note: this returns a continuation function that should be run for consistency.
export const placeMultiBetMain = async (
  body: ValidatedAPIParams<'multi-bet'>,
  uid: string,
  isApi: boolean
) => {
  const { amount, contractId } = body

  const results = await runEvilTransaction(async (pgTrans, fbTrans) => {
    const { user, contract, contractDoc } = await validateBet(
      uid,
      amount,
      contractId,
      pgTrans,
      fbTrans,
      isApi
    )

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
    const answersSnap = await fbTrans.get(contractDoc.collection('answersCpmm'))
    const answers = answersSnap.docs.map((doc) => doc.data() as Answer)
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
          await getUnfilledBetsAndUserBalances(pgTrans, contractDoc, answerId)
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
          contractDoc,
          contract,
          user,
          isApi,
          pgTrans,
          fbTrans,
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
    const contract = results[0].contract
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
