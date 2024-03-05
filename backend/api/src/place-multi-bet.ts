import * as admin from 'firebase-admin'

import { APIError, type APIHandler } from './helpers/endpoint'
import { BetInfo, CandidateBet, getNewMultiCpmmBetsInfo } from 'common/new-bet'
import { Bet, LimitBet } from 'common/bet'
import { floatingEqual } from 'common/util/math'
import { Answer } from 'common/answer'
import { CpmmState } from 'common/calculate-cpmm'
import { ValidatedAPIParams } from 'common/api/schema'
import { onCreateBets } from 'api/on-create-bet'
import {
  getUnfilledBetsAndUserBalances,
  maker,
  processNewBetResult,
  validateBet,
} from 'api/place-bet'
import { log } from 'shared/utils'

export const placeMultiBet: APIHandler<'multi-bet'> = async (props, auth) => {
  const isApi = auth.creds.kind === 'key'
  return await placeMultiBetMain(props, auth.uid, isApi)
}

// Note: this returns a continuation function that should be run for consistency.
export const placeMultiBetMain = async (
  body: ValidatedAPIParams<'multi-bet'>,
  uid: string,
  isApi: boolean
) => {
  const { amount, contractId } = body

  const results = await firestore.runTransaction(async (trans) => {
    const { user, contract, contractDoc, userDoc } = await validateBet(
      uid,
      amount,
      contractId,
      trans,
      isApi
    )

    const { closeTime, mechanism } = contract
    if (closeTime && Date.now() > closeTime)
      throw new APIError(403, 'Trading is closed.')

    const newBetResults = await (async (): Promise<
      (BetInfo & {
        makers?: maker[]
        ordersToCancel?: LimitBet[]
        otherBetResults?: {
          answer: Answer
          bet: CandidateBet<Bet>
          cpmmState: CpmmState
          makers: maker[]
          ordersToCancel: LimitBet[]
        }[]
      })[]
    > => {
      if (mechanism != 'cpmm-multi-1') {
        throw new APIError(
          400,
          'Contract type/mechanism not supported (or is no longer)'
        )
      }
      const { shouldAnswersSumToOne } = contract
      const { answerIds, outcome, limitProb, expiresAt } = body
      if (expiresAt && expiresAt < Date.now())
        throw new APIError(403, 'Bet cannot expire in the past.')
      const answersSnap = await trans.get(contractDoc.collection('answersCpmm'))
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

      let roundedLimitProb = limitProb
      if (limitProb !== undefined) {
        const isRounded = floatingEqual(
          Math.round(limitProb * 100),
          limitProb * 100
        )
        if (!isRounded)
          throw new APIError(
            400,
            'limitProb must be in increments of 0.01 (i.e. whole percentage points)'
          )

        roundedLimitProb = Math.round(limitProb * 100) / 100
      }
      const unfilledBetsAndBalances = await Promise.all(
        answerIds.map(
          async (answerId) =>
            await getUnfilledBetsAndUserBalances(trans, contractDoc, answerId)
        )
      )
      const unfilledBets = unfilledBetsAndBalances.flatMap(
        (b) => b.unfilledBets
      )
      let balancesByUserId: Record<string, number> = {}
      unfilledBetsAndBalances.forEach((b) => {
        balancesByUserId = { ...balancesByUserId, ...b.balanceByUserId }
      })

      return getNewMultiCpmmBetsInfo(
        contract,
        answers,
        betOnAnswers,
        outcome,
        amount,
        roundedLimitProb,
        unfilledBets,
        balancesByUserId,
        expiresAt,
        true
      )
    })()
    log(`Calculated new bet information for ${user.username} - auth ${uid}.`)
    return newBetResults.map((newBetResult) =>
      processNewBetResult(
        newBetResult,
        contractDoc,
        contract,
        userDoc,
        user,
        isApi,
        trans
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
    })),
    continue: continuation,
  }
}

const firestore = admin.firestore()
