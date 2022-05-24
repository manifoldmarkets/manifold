import * as admin from 'firebase-admin'
import { z } from 'zod'

import { APIError, newEndpoint, validate } from './api'
import { Contract } from '../../common/contract'
import { User } from '../../common/user'
import {
  BetInfo,
  getNewBinaryCpmmBetInfo,
  getNewBinaryDpmBetInfo,
  getNewMultiBetInfo,
  getNumericBetsInfo,
} from '../../common/new-bet'
import { addObjects, removeUndefinedProps } from '../../common/util/object'
import { redeemShares } from './redeem-shares'

const bodySchema = z.object({
  contractId: z.string(),
  amount: z.number().gte(1),
})

const binarySchema = z.object({
  outcome: z.enum(['YES', 'NO']),
})

const freeResponseSchema = z.object({
  outcome: z.string(),
})

const numericSchema = z.object({
  outcome: z.string(),
  value: z.number(),
})

export const placeBet = newEndpoint(['POST'], async (req, [bettor, _]) => {
  const { amount, contractId } = validate(bodySchema, req.body)

  const result = await firestore.runTransaction(async (trans) => {
    const userDoc = firestore.doc(`users/${bettor.id}`)
    const userSnap = await trans.get(userDoc)
    if (!userSnap.exists) throw new APIError(400, 'User not found.')
    const user = userSnap.data() as User
    if (user.balance < amount) throw new APIError(400, 'Insufficient balance.')

    const contractDoc = firestore.doc(`contracts/${contractId}`)
    const contractSnap = await trans.get(contractDoc)
    if (!contractSnap.exists) throw new APIError(400, 'Contract not found.')
    const contract = contractSnap.data() as Contract

    const loanAmount = 0
    const { closeTime, outcomeType, mechanism, collectedFees, volume } =
      contract
    if (closeTime && Date.now() > closeTime)
      throw new APIError(400, 'Trading is closed.')

    const newBetDoc = contractDoc.collection('bets').doc()
    const {
      newBet,
      newPool,
      newTotalShares,
      newTotalBets,
      newTotalLiquidity,
      newP,
    } = await (async (): Promise<BetInfo> => {
      if (outcomeType == 'BINARY' && mechanism == 'dpm-2') {
        const { outcome } = validate(binarySchema, req.body)
        return getNewBinaryDpmBetInfo(
          user,
          outcome,
          amount,
          contract,
          loanAmount,
          newBetDoc.id
        )
      } else if (outcomeType == 'BINARY' && mechanism == 'cpmm-1') {
        const { outcome } = validate(binarySchema, req.body)
        return getNewBinaryCpmmBetInfo(
          user,
          outcome,
          amount,
          contract,
          loanAmount,
          newBetDoc.id
        )
      } else if (outcomeType == 'FREE_RESPONSE' && mechanism == 'dpm-2') {
        const { outcome } = validate(freeResponseSchema, req.body)
        const answerDoc = contractDoc.collection('answers').doc(outcome)
        const answerSnap = await trans.get(answerDoc)
        if (!answerSnap.exists) throw new APIError(400, 'Invalid answer')
        return getNewMultiBetInfo(
          user,
          outcome,
          amount,
          contract,
          loanAmount,
          newBetDoc.id
        )
      } else if (outcomeType == 'NUMERIC' && mechanism == 'dpm-2') {
        const { outcome, value } = validate(numericSchema, req.body)
        return getNumericBetsInfo(
          user,
          value,
          outcome,
          amount,
          contract,
          newBetDoc.id
        )
      } else {
        throw new APIError(500, 'Contract has invalid type/mechanism.')
      }
    })()

    if (newP != null && !isFinite(newP)) {
      throw new APIError(400, 'Trade rejected due to overflow error.')
    }

    const newBalance = user.balance - amount - loanAmount
    trans.create(newBetDoc, newBet)
    trans.update(userDoc, { balance: newBalance })
    trans.update(
      contractDoc,
      removeUndefinedProps({
        pool: newPool,
        p: newP,
        totalShares: newTotalShares,
        totalBets: newTotalBets,
        totalLiquidity: newTotalLiquidity,
        collectedFees: addObjects(newBet.fees, collectedFees),
        volume: volume + amount,
      })
    )

    return { betId: newBetDoc.id }
  })

  await redeemShares(bettor.id, contractId)
  return result
})

const firestore = admin.firestore()
