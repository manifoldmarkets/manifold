import * as admin from 'firebase-admin'

import { APIError, type APIHandler } from './helpers/endpoint'
import { BetInfo, CandidateBet, getNewMultiCpmmBetsInfo } from 'common/new-bet'
import { Bet, LimitBet } from 'common/bet'
import { floatingEqual } from 'common/util/math'
import { GCPLog } from 'shared/utils'
import { createLimitBetCanceledNotification } from 'shared/create-notification'
import { Answer } from 'common/answer'
import { CpmmState } from 'common/calculate-cpmm'
import { ValidatedAPIParams } from 'common/api/schema'
import { onCreateBet } from 'api/on-create-bet'
import {
  getUnfilledBetsAndUserBalances,
  maker,
  processNewBetResult,
  processRedemptions,
  validateBet,
} from 'api/place-bet'

export const placeMultiBet: APIHandler<'multi-bet'> = async (
  props,
  auth,
  { log }
) => {
  const isApi = auth.creds.kind === 'key'
  return await placeMultiBetMain(props, auth.uid, isApi, log)
}

// Note: this returns a continuation function that should be run for consistency.
export const placeMultiBetMain = async (
  body: ValidatedAPIParams<'multi-bet'>,
  uid: string,
  isApi: boolean,
  log: GCPLog
) => {
  const { amount, contractId } = body

  const results = await firestore.runTransaction(async (trans) => {
    const { user, contract, contractDoc, userDoc } = await validateBet(
      uid,
      amount,
      contractId,
      trans,
      log
    )

    const { closeTime, outcomeType, mechanism } = contract
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
      if (outcomeType !== 'MULTIPLE_CHOICE' || mechanism != 'cpmm-multi-1') {
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
        log,
        trans
      )
    )
  })

  log(`Main transaction finished - auth ${uid}.`)
  await Promise.all(
    results.map(async (result) => processRedemptions(result, log))
  )

  const continuation = async () => {
    await Promise.all(
      results.map(async (result) => {
        const { betId, contract, makers, ordersToCancel, user } = result
        if (ordersToCancel) {
          await Promise.all(
            ordersToCancel.map((order) => {
              createLimitBetCanceledNotification(
                user,
                order.userId,
                order,
                makers?.find((m) => m.bet.id === order.id)?.amount ?? 0,
                contract
              )
            })
          )
        }
        const bet = await firestore
          .doc(`contracts/${contract.id}/bets/${betId}`)
          .get()
        await onCreateBet(bet.data() as Bet, contract, user, log)
      })
    )
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
