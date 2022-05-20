import * as admin from 'firebase-admin'

import { APIError, newEndpoint, parseCredentials, lookupUser } from './api'
import { Contract } from '../../common/contract'
import { User } from '../../common/user'
import {
  getNewBinaryCpmmBetInfo,
  getNewBinaryDpmBetInfo,
  getNewMultiBetInfo,
  getNumericBetsInfo,
} from '../../common/new-bet'
import { addObjects, removeUndefinedProps } from '../../common/util/object'
import { Bet } from '../../common/bet'
import { redeemShares } from './redeem-shares'
import { Fees } from '../../common/fees'

export const placeBet = newEndpoint(['POST'], async (req, _res) => {
  const [bettor, _privateUser] = await lookupUser(await parseCredentials(req))
  const { amount, outcome, contractId, value } = req.body.data || {}

  if (amount <= 0 || isNaN(amount) || !isFinite(amount))
    throw new APIError(400, 'Invalid amount')

  if (outcome !== 'YES' && outcome !== 'NO' && isNaN(+outcome))
    throw new APIError(400, 'Invalid outcome')

  if (value !== undefined && !isFinite(value))
    throw new APIError(400, 'Invalid value')

  // run as transaction to prevent race conditions
  return await firestore
    .runTransaction(async (transaction) => {
      const userDoc = firestore.doc(`users/${bettor.id}`)
      const userSnap = await transaction.get(userDoc)
      if (!userSnap.exists) throw new APIError(400, 'User not found')
      const user = userSnap.data() as User

      const contractDoc = firestore.doc(`contracts/${contractId}`)
      const contractSnap = await transaction.get(contractDoc)
      if (!contractSnap.exists) throw new APIError(400, 'Invalid contract')
      const contract = contractSnap.data() as Contract

      const { closeTime, outcomeType, mechanism, collectedFees, volume } =
        contract
      if (closeTime && Date.now() > closeTime)
        throw new APIError(400, 'Trading is closed')

      const yourBetsSnap = await transaction.get(
        contractDoc.collection('bets').where('userId', '==', bettor.id)
      )
      const yourBets = yourBetsSnap.docs.map((doc) => doc.data() as Bet)

      const loanAmount = 0 // getLoanAmount(yourBets, amount)
      if (user.balance < amount) throw new APIError(400, 'Insufficient balance')

      if (outcomeType === 'FREE_RESPONSE') {
        const answerSnap = await transaction.get(
          contractDoc.collection('answers').doc(outcome)
        )
        if (!answerSnap.exists) throw new APIError(400, 'Invalid contract')
      }

      const newBetDoc = firestore
        .collection(`contracts/${contractId}/bets`)
        .doc()

      const {
        newBet,
        newPool,
        newTotalShares,
        newTotalBets,
        newBalance,
        newTotalLiquidity,
        fees,
        newP,
      } =
        outcomeType === 'BINARY'
          ? mechanism === 'dpm-2'
            ? getNewBinaryDpmBetInfo(
                user,
                outcome as 'YES' | 'NO',
                amount,
                contract,
                loanAmount,
                newBetDoc.id
              )
            : (getNewBinaryCpmmBetInfo(
                user,
                outcome as 'YES' | 'NO',
                amount,
                contract,
                loanAmount,
                newBetDoc.id
              ) as any)
          : outcomeType === 'NUMERIC' && mechanism === 'dpm-2'
          ? getNumericBetsInfo(
              user,
              value,
              outcome,
              amount,
              contract,
              newBetDoc.id
            )
          : getNewMultiBetInfo(
              user,
              outcome,
              amount,
              contract as any,
              loanAmount,
              newBetDoc.id
            )

      if (newP !== undefined && !isFinite(newP)) {
        throw new APIError(400, 'Trade rejected due to overflow error.')
      }

      transaction.create(newBetDoc, newBet)

      transaction.update(
        contractDoc,
        removeUndefinedProps({
          pool: newPool,
          p: newP,
          totalShares: newTotalShares,
          totalBets: newTotalBets,
          totalLiquidity: newTotalLiquidity,
          collectedFees: addObjects<Fees>(fees ?? {}, collectedFees ?? {}),
          volume: volume + amount,
        })
      )

      if (!isFinite(newBalance)) {
        throw new APIError(500, 'Invalid user balance for ' + user.username)
      }

      transaction.update(userDoc, { balance: newBalance })

      return { betId: newBetDoc.id }
    })
    .then(async (result) => {
      await redeemShares(bettor.id, contractId)
      return result
    })
})

const firestore = admin.firestore()
