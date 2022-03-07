import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { Contract } from '../../common/contract'
import { User } from '../../common/user'
import {
  getNewBinaryCpmmBetInfo,
  getNewBinaryDpmBetInfo,
  getNewMultiBetInfo,
  getLoanAmount,
} from '../../common/new-bet'
import { removeUndefinedProps } from '../../common/util/object'
import { Bet } from '../../common/bet'

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
    return await firestore.runTransaction(async (transaction) => {
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

      const { closeTime, outcomeType, mechanism } = contract
      if (closeTime && Date.now() > closeTime)
        return { status: 'error', message: 'Trading is closed' }

      const yourBetsSnap = await transaction.get(
        contractDoc.collection('bets').where('userId', '==', userId)
      )
      const yourBets = yourBetsSnap.docs.map((doc) => doc.data() as Bet)

      const loanAmount = getLoanAmount(yourBets, amount)
      if (user.balance < amount - loanAmount)
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

      const { newBet, newPool, newTotalShares, newTotalBets, newBalance } =
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
          : getNewMultiBetInfo(
              user,
              outcome,
              amount,
              contract as any,
              loanAmount,
              newBetDoc.id
            )

      transaction.create(newBetDoc, newBet)

      transaction.update(
        contractDoc,
        removeUndefinedProps({
          pool: newPool,
          totalShares: newTotalShares,
          totalBets: newTotalBets,
        })
      )

      transaction.update(userDoc, { balance: newBalance })

      return { status: 'success', betId: newBetDoc.id }
    })
  }
)

const firestore = admin.firestore()
