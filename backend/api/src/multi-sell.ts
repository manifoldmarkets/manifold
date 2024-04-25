import * as admin from 'firebase-admin'

import { APIError, type APIHandler } from './helpers/endpoint'
import { Bet } from 'common/bet'
import { Answer } from 'common/answer'
import { onCreateBets } from 'api/on-create-bet'
import {
  getUnfilledBetsAndUserBalances,
  processNewBetResult,
} from 'api/place-bet'
import { log } from 'shared/utils'
import * as crypto from 'crypto'
import { Contract } from 'common/contract'
import { User } from 'common/user'
import { groupBy, mapValues, sum, sumBy } from 'lodash'
import { getCpmmMultiSellSharesInfo } from 'common/sell-bet'
import { FieldValue } from 'firebase-admin/firestore'

export const multiSell: APIHandler<'multi-sell'> = async (props, auth) => {
  const isApi = auth.creds.kind === 'key'
  const { contractId, answerIds } = props
  const { uid } = auth

  const results = await firestore.runTransaction(async (trans) => {
    const contractDoc = firestore.doc(`contracts/${contractId}`)
    const userDoc = firestore.doc(`users/${uid}`)
    const betsQ = contractDoc.collection('bets').where('userId', '==', uid)
    log(
      `Checking for limit orders and bets in sellshares for user ${uid} on contract id ${contractId}.`
    )
    const [contractSnap, userSnap] = await trans.getAll(contractDoc, userDoc)

    if (!contractSnap.exists) throw new APIError(404, 'Contract not found')
    if (!userSnap.exists) throw new APIError(401, 'Your account was not found')
    const contract = contractSnap.data() as Contract
    const user = userSnap.data() as User
    const { closeTime, mechanism } = contract
    if (closeTime && Date.now() > closeTime)
      throw new APIError(403, 'Trading is closed.')
    if (mechanism != 'cpmm-multi-1' || !('shouldAnswersSumToOne' in contract)) {
      throw new APIError(400, 'Contract type/mechanism not supported')
    }
    const answersSnap = await trans.get(contractDoc.collection('answersCpmm'))
    const answers = answersSnap.docs.map((doc) => doc.data() as Answer)
    const answersToSell = answers.filter((a) => answerIds.includes(a.id))
    if (!answersToSell) throw new APIError(404, 'Answers not found')
    if ('resolution' in answersToSell && answersToSell.resolution)
      throw new APIError(403, 'Answer is resolved and cannot be bet on')

    const userBetsSnap = await Promise.all(
      answersToSell.map(async (answer) =>
        trans.get(betsQ.where('answerId', '==', answer.id))
      )
    )
    const unfilledBetsAndBalances = await Promise.all(
      answersToSell.map((answer) =>
        getUnfilledBetsAndUserBalances(trans, contractDoc, answer.id)
      )
    )
    const unfilledBets = unfilledBetsAndBalances.flatMap((b) => b.unfilledBets)
    let balancesByUserId: Record<string, number> = {}
    unfilledBetsAndBalances.forEach((b) => {
      balancesByUserId = { ...balancesByUserId, ...b.balanceByUserId }
    })
    const userBets = userBetsSnap.flatMap((snap) =>
      snap.docs.map((doc) => doc.data() as Bet)
    )
    const loanAmountByAnswerId = mapValues(
      groupBy(userBets, 'answerId'),
      (bets) => sumBy(bets, (bet) => bet.loanAmount ?? 0)
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

    const betGroupId = crypto.randomBytes(12).toString('hex')
    const betResults = getCpmmMultiSellSharesInfo(
      contract,
      answers,
      nonRedemptionBetsByAnswerId,
      unfilledBets,
      balancesByUserId,
      loanAmountByAnswerId
    )
    log(`Calculated new bet information for ${user.username} - auth ${uid}.`)
    const bets = betResults.map((newBetResult) =>
      processNewBetResult(
        newBetResult,
        contractDoc,
        contract,
        userDoc,
        user,
        isApi,
        trans,
        undefined,
        betGroupId
      )
    )
    const loanPaid = sum(Object.values(loanAmountByAnswerId))
    if (loanPaid > 0 && bets.length > 0) {
      trans.update(userDoc, {
        balance: FieldValue.increment(-loanPaid),
      })
    }
    return bets
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

const firestore = admin.firestore()
