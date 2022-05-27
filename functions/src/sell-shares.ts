import { partition, sumBy } from 'lodash'
import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'

import { Binary, CPMM, FullContract } from '../../common/contract'
import { User } from '../../common/user'
import { getCpmmSellBetInfo } from '../../common/sell-bet'
import { addObjects, removeUndefinedProps } from '../../common/util/object'
import { getValues } from './utils'
import { Bet } from '../../common/bet'

export const sellShares = functions.runWith({ minInstances: 1 }).https.onCall(
  async (
    data: {
      contractId: string
      shares: number
      outcome: 'YES' | 'NO'
    },
    context
  ) => {
    const userId = context?.auth?.uid
    if (!userId) return { status: 'error', message: 'Not authorized' }

    const { contractId, shares, outcome } = data

    // Run as transaction to prevent race conditions.
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
      const contract = contractSnap.data() as FullContract<CPMM, Binary>
      const { closeTime, mechanism, collectedFees, volume } = contract

      if (mechanism !== 'cpmm-1')
        return {
          status: 'error',
          message: 'Sell shares only works with mechanism cpmm-1',
        }

      if (closeTime && Date.now() > closeTime)
        return { status: 'error', message: 'Trading is closed' }

      const userBets = await getValues<Bet>(
        contractDoc.collection('bets').where('userId', '==', userId)
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
      if (shares > maxShares + 0.000000000001) {
        return {
          status: 'error',
          message: `You can only sell ${maxShares} shares`,
        }
      }

      const newBetDoc = firestore
        .collection(`contracts/${contractId}/bets`)
        .doc()

      const { newBet, newPool, newP, newBalance, fees } = getCpmmSellBetInfo(
        user,
        shares,
        outcome,
        contract,
        prevLoanAmount,
        newBetDoc.id
      )

      if (!isFinite(newP)) {
        return {
          status: 'error',
          message: 'Trade rejected due to overflow error.',
        }
      }

      if (!isFinite(newBalance)) {
        throw new Error('Invalid user balance for ' + user.username)
      }

      transaction.update(userDoc, { balance: newBalance })
      transaction.create(newBetDoc, newBet)
      transaction.update(
        contractDoc,
        removeUndefinedProps({
          pool: newPool,
          p: newP,
          collectedFees: addObjects(fees ?? {}, collectedFees ?? {}),
          volume: volume + Math.abs(newBet.amount),
        })
      )

      return { status: 'success' }
    })
  }
)

const firestore = admin.firestore()
