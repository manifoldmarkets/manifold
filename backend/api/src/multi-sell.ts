import * as admin from 'firebase-admin'
import { APIError, type APIHandler } from './helpers/endpoint'
import { Answer } from 'common/answer'
import { onCreateBets } from 'api/on-create-bet'
import {
  getUnfilledBetsAndUserBalances,
  processNewBetResult,
} from 'api/place-bet'
import { getContractSupabase, getUser, log } from 'shared/utils'
import * as crypto from 'crypto'
import { groupBy, mapValues, sum, sumBy } from 'lodash'
import { getCpmmMultiSellSharesInfo } from 'common/sell-bet'
import { incrementBalance } from 'shared/supabase/users'
import { runEvilTransaction } from 'shared/evil-transaction'
import { convertBet } from 'common/supabase/bets'

export const multiSell: APIHandler<'multi-sell'> = async (props, auth) => {
  const isApi = auth.creds.kind === 'key'
  const { contractId, answerIds } = props
  const { uid } = auth

  const contract = await getContractSupabase(contractId)
  if (!contract) throw new APIError(404, 'Contract not found')
  const { closeTime, mechanism } = contract
  if (closeTime && Date.now() > closeTime)
    throw new APIError(403, 'Trading is closed.')
  if (mechanism != 'cpmm-multi-1' || !('shouldAnswersSumToOne' in contract)) {
    throw new APIError(400, 'Contract type/mechanism not supported')
  }

  const user = await getUser(uid)
  if (!user) throw new APIError(401, 'Your account was not found')

  const results = await runEvilTransaction(async (pgTrans, fbTrans) => {
    const contractDoc = firestore.doc(`contracts/${contractId}`)

    log(
      `Checking for limit orders and bets in sellshares for user ${uid} on contract id ${contractId}.`
    )

    const answersSnap = await fbTrans.get(contractDoc.collection('answersCpmm'))
    const answers = answersSnap.docs.map((doc) => doc.data() as Answer)
    const answersToSell = answers.filter((a) => answerIds.includes(a.id))
    if (!answersToSell) throw new APIError(404, 'Answers not found')
    if ('resolution' in answersToSell && answersToSell.resolution)
      throw new APIError(403, 'Answer is resolved and cannot be bet on')

    const unfilledBetsAndBalances = await Promise.all(
      answersToSell.map((answer) =>
        getUnfilledBetsAndUserBalances(pgTrans, contractDoc, answer.id)
      )
    )
    const unfilledBets = unfilledBetsAndBalances.flatMap((b) => b.unfilledBets)
    let balancesByUserId: Record<string, number> = {}
    unfilledBetsAndBalances.forEach((b) => {
      balancesByUserId = { ...balancesByUserId, ...b.balanceByUserId }
    })

    const userBets = await pgTrans.map(
      `select * from contract_bets where user_id = $1 and answer_id in ($2:list)`,
      [uid, answersToSell.map((a) => a.id)],
      convertBet
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
    const bets = await Promise.all(
      betResults.map((newBetResult) =>
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
    const loanPaid = sum(Object.values(loanAmountByAnswerId))
    if (loanPaid > 0 && bets.length > 0) {
      await incrementBalance(pgTrans, uid, {
        balance: -loanPaid,
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
