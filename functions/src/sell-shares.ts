import { sumBy } from 'lodash'
import * as admin from 'firebase-admin'
import { z } from 'zod'

import { APIError, newEndpoint, validate } from './api'
import { Contract, CPMM_MIN_POOL_QTY } from '../../common/contract'
import { User } from '../../common/user'
import { getCpmmSellBetInfo } from '../../common/sell-bet'
import { addObjects, removeUndefinedProps } from '../../common/util/object'
import { getValues } from './utils'
import { Bet } from '../../common/bet'

const bodySchema = z.object({
  contractId: z.string(),
  shares: z.number(),
  outcome: z.enum(['YES', 'NO']),
})

export const sellshares = newEndpoint({}, async (req, auth) => {
  const { contractId, shares, outcome } = validate(bodySchema, req.body)

  // Run as transaction to prevent race conditions.
  return await firestore.runTransaction(async (transaction) => {
    const contractDoc = firestore.doc(`contracts/${contractId}`)
    const userDoc = firestore.doc(`users/${auth.uid}`)
    const betsQ = contractDoc.collection('bets').where('userId', '==', auth.uid)
    const [[contractSnap, userSnap], userBets] = await Promise.all([
      transaction.getAll(contractDoc, userDoc),
      getValues<Bet>(betsQ), // TODO: why is this not in the transaction??
    ])
    if (!contractSnap.exists) throw new APIError(400, 'Contract not found.')
    if (!userSnap.exists) throw new APIError(400, 'User not found.')

    const contract = contractSnap.data() as Contract
    const user = userSnap.data() as User

    const { closeTime, mechanism, collectedFees, volume } = contract

    if (mechanism !== 'cpmm-1')
      throw new APIError(400, 'You can only sell shares on CPMM-1 contracts.')
    if (closeTime && Date.now() > closeTime)
      throw new APIError(400, 'Trading is closed.')

    const prevLoanAmount = sumBy(userBets, (bet) => bet.loanAmount ?? 0)

    const outcomeBets = userBets.filter((bet) => bet.outcome == outcome)
    const maxShares = sumBy(outcomeBets, (bet) => bet.shares)

    if (shares > maxShares)
      throw new APIError(400, `You can only sell up to ${maxShares} shares.`)

    const { newBet, newPool, newP, fees } = getCpmmSellBetInfo(
      shares,
      outcome,
      contract,
      prevLoanAmount
    )

    if (
      !newP ||
      !isFinite(newP) ||
      Math.min(...Object.values(newPool ?? {})) < CPMM_MIN_POOL_QTY
    ) {
      throw new APIError(400, 'Sale too large for current liquidity pool.')
    }

    const newBetDoc = firestore.collection(`contracts/${contractId}/bets`).doc()
    const newBalance = user.balance - newBet.amount + (newBet.loanAmount ?? 0)
    const userId = user.id

    transaction.update(userDoc, { balance: newBalance })
    transaction.create(newBetDoc, { id: newBetDoc.id, userId, ...newBet })
    transaction.update(
      contractDoc,
      removeUndefinedProps({
        pool: newPool,
        p: newP,
        collectedFees: addObjects(fees, collectedFees),
        volume: volume + Math.abs(newBet.amount),
      })
    )

    return { status: 'success' }
  })
})

const firestore = admin.firestore()
