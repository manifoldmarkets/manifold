import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { Contract } from 'common/contract'
import { User } from 'common/user'
import {
  getNewBinaryCpmmBetInfo,
  getNewBinaryDpmBetInfo,
  getNewMultiBetInfo,
  getNumericBetsInfo,
} from 'common/new-bet'
import { addObjects, removeUndefinedProps } from 'common/util/object'
import { Bet } from 'common/bet'
import { redeemShares } from './redeem-shares'
import { Fees } from 'common/fees'

export const placeBet = functions.runWith({ minInstances: 1 }).https.onCall(
  async (
    data: {
      amount: number
      outcome: string
      contractId: string
    },
    context
  ) => {
    const userId = context?.auth?.uid
    if (!userId) return { status: 'error', message: 'Not authorized' }

    const { amount, outcome, contractId } = data

    if (amount <= 0 || isNaN(amount) || !isFinite(amount))
      return { status: 'error', message: 'Invalid amount' }

    if (outcome !== 'YES' && outcome !== 'NO' && isNaN(+outcome))
      return { status: 'error', message: 'Invalid outcome' }

    // run as transaction to prevent race conditions
    return await firestore
      .runTransaction(async (transaction) => {
        const userDoc = firestore.doc(`users/${userId}`)
        const userSnap = await transaction.get(userDoc)
        if (!userSnap.exists)
          return { status: 'error', message: 'User not found' }
        const user = userSnap.data() as User

        const contractDoc = firestore.doc(`contracts/${contractId}`)
        const contractSnap = await transaction.get(contractDoc)
        if (!contractSnap.exists)
          return { status: 'error', message: 'Invalid contract' }
        const contract = contractSnap.data() as Contract

        const { closeTime, outcomeType, mechanism, collectedFees, volume } =
          contract
        if (closeTime && Date.now() > closeTime)
          return { status: 'error', message: 'Trading is closed' }

        const yourBetsSnap = await transaction.get(
          contractDoc.collection('bets').where('userId', '==', userId)
        )
        const yourBets = yourBetsSnap.docs.map((doc) => doc.data() as Bet)

        const loanAmount = 0 // getLoanAmount(yourBets, amount)
        if (user.balance < amount)
          return { status: 'error', message: 'Insufficient balance' }

        if (outcomeType === 'FREE_RESPONSE') {
          const answerSnap = await transaction.get(
            contractDoc.collection('answers').doc(outcome)
          )
          if (!answerSnap.exists)
            return { status: 'error', message: 'Invalid contract' }
        }

        const newBetDoc = firestore
          .collection(`contracts/${contractId}/bets`)
          .doc()

        const {
          newBet,
          newBets,
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
            ? getNumericBetsInfo(user, outcome, amount, contract, newBetDoc.id)
            : getNewMultiBetInfo(
                user,
                outcome,
                amount,
                contract as any,
                loanAmount,
                newBetDoc.id
              )

        if (newP !== undefined && !isFinite(newP)) {
          return {
            status: 'error',
            message: 'Trade rejected due to overflow error.',
          }
        }

        if (newBet) transaction.create(newBetDoc, newBet)

        if (newBets) {
          for (let newBet of newBets) {
            const newBetDoc = firestore
              .collection(`contracts/${contractId}/bets`)
              .doc()

            transaction.create(newBetDoc, { id: newBetDoc.id, ...newBet })
          }
        }

        transaction.update(
          contractDoc,
          removeUndefinedProps({
            pool: newPool,
            p: newP,
            totalShares: newTotalShares,
            totalBets: newTotalBets,
            totalLiquidity: newTotalLiquidity,
            collectedFees: addObjects<Fees>(fees ?? {}, collectedFees ?? {}),
            volume: volume + Math.abs(amount),
          })
        )

        if (!isFinite(newBalance)) {
          throw new Error('Invalid user balance for ' + user.username)
        }

        transaction.update(userDoc, { balance: newBalance })

        return { status: 'success', betId: newBetDoc.id }
      })
      .then(async (result) => {
        await redeemShares(userId, contractId)
        return result
      })
  }
)

const firestore = admin.firestore()
