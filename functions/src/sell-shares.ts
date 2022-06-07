import { partition, sumBy } from 'lodash'
import * as admin from 'firebase-admin'
import { z } from 'zod'

import { APIError, newEndpoint, validate } from './api'
import { Contract } from '../../common/contract'
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

export const sellshares = newEndpoint(['POST'], async (req, auth) => {
  const { contractId, shares, outcome } = validate(bodySchema, req.body)

  // Run as transaction to prevent race conditions.
  return await firestore.runTransaction(async (transaction) => {
    const userDoc = firestore.doc(`users/${auth.uid}`)
    const userSnap = await transaction.get(userDoc)
    if (!userSnap.exists) throw new APIError(400, 'User not found.')
    const user = userSnap.data() as User

    const contractDoc = firestore.doc(`contracts/${contractId}`)
    const contractSnap = await transaction.get(contractDoc)
    if (!contractSnap.exists) throw new APIError(400, 'Contract not found.')
    const contract = contractSnap.data() as Contract
    const { closeTime, mechanism, collectedFees, volume } = contract

    if (mechanism !== 'cpmm-1')
      throw new APIError(400, 'You can only sell shares on CPMM-1 contracts.')
    if (closeTime && Date.now() > closeTime)
      throw new APIError(400, 'Trading is closed.')

    const userBets = await getValues<Bet>(
      contractDoc.collection('bets').where('userId', '==', auth.uid)
    )

    const prevLoanAmount = sumBy(userBets, (bet) => bet.loanAmount ?? 0)

    const [yesBets, noBets] = partition(
      userBets ?? [],
      (bet) => bet.outcome === 'YES'
    )
    const [yesShares, noShares] = [
      sumBy(yesBets, (bet) => bet.shares),
      sumBy(noBets, (bet) => bet.shares),
    ]

    const maxShares = outcome === 'YES' ? yesShares : noShares
    if (shares > maxShares + 0.000000000001)
      throw new APIError(400, `You can only sell up to ${maxShares} shares.`)

    const { newBet, newPool, newP, fees } = getCpmmSellBetInfo(
      shares,
      outcome,
      contract,
      prevLoanAmount
    )

    if (!isFinite(newP)) {
      throw new APIError(500, 'Trade rejected due to overflow error.')
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
