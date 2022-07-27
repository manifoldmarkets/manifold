import { sumBy, uniq } from 'lodash'
import * as admin from 'firebase-admin'
import { z } from 'zod'

import { APIError, newEndpoint, validate } from './api'
import { Contract, CPMM_MIN_POOL_QTY } from '../../common/contract'
import { User } from '../../common/user'
import { getCpmmSellBetInfo } from '../../common/sell-bet'
import { addObjects, removeUndefinedProps } from '../../common/util/object'
import { getValues, log } from './utils'
import { Bet } from '../../common/bet'
import { floatingLesserEqual } from '../../common/util/math'
import { getUnfilledBetsQuery, updateMakers } from './place-bet'
import { FieldValue } from 'firebase-admin/firestore'
import { redeemShares } from './redeem-shares'

const bodySchema = z.object({
  contractId: z.string(),
  shares: z.number(),
  outcome: z.enum(['YES', 'NO']),
})

export const sellshares = newEndpoint({}, async (req, auth) => {
  const { contractId, shares, outcome } = validate(bodySchema, req.body)

  // Run as transaction to prevent race conditions.
  const result = await firestore.runTransaction(async (transaction) => {
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

    if (!floatingLesserEqual(shares, maxShares))
      throw new APIError(400, `You can only sell up to ${maxShares} shares.`)

    const soldShares = Math.min(shares, maxShares)

    const unfilledBetsSnap = await transaction.get(
      getUnfilledBetsQuery(contractDoc)
    )
    const unfilledBets = unfilledBetsSnap.docs.map((doc) => doc.data())

    const { newBet, newPool, newP, fees, makers } = getCpmmSellBetInfo(
      soldShares,
      outcome,
      contract,
      prevLoanAmount,
      unfilledBets
    )

    if (
      !newP ||
      !isFinite(newP) ||
      Math.min(...Object.values(newPool ?? {})) < CPMM_MIN_POOL_QTY
    ) {
      throw new APIError(400, 'Sale too large for current liquidity pool.')
    }

    const newBetDoc = firestore.collection(`contracts/${contractId}/bets`).doc()

    updateMakers(makers, newBetDoc.id, contractDoc, transaction)

    transaction.update(userDoc, {
      balance: FieldValue.increment(-newBet.amount),
    })
    transaction.create(newBetDoc, {
      id: newBetDoc.id,
      userId: user.id,
      ...newBet,
    })
    transaction.update(
      contractDoc,
      removeUndefinedProps({
        pool: newPool,
        p: newP,
        collectedFees: addObjects(fees, collectedFees),
        volume: volume + Math.abs(newBet.amount),
      })
    )

    return { newBet, makers }
  })

  const userIds = uniq(result.makers.map((maker) => maker.bet.userId))
  await Promise.all(userIds.map((userId) => redeemShares(userId, contractId)))
  log('Share redemption transaction finished.')

  return { status: 'success' }
})

const firestore = admin.firestore()
