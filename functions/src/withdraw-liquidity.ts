import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { CPMMContract } from '../../common/contract'
import { User } from '../../common/user'
import { subtractObjects } from '../../common/util/object'
import { LiquidityProvision } from '../../common/liquidity-provision'
import { getUserLiquidityShares } from '../../common/calculate-cpmm'
import { Bet } from '../../common/bet'
import { getProbability } from '../../common/calculate'
import { noFees } from '../../common/fees'

import { APIError } from './api'

export const withdrawLiquidity = functions
  .runWith({ minInstances: 1 })
  .https.onCall(
    async (
      data: {
        contractId: string
      },
      context
    ) => {
      const userId = context?.auth?.uid
      if (!userId) return { status: 'error', message: 'Not authorized' }

      const { contractId } = data
      if (!contractId)
        return { status: 'error', message: 'Missing contract id' }

      const result = await firestore.runTransaction(async (trans) => {
        const lpDoc = firestore.doc(`users/${userId}`)
        const lpSnap = await trans.get(lpDoc)
        if (!lpSnap.exists) throw new APIError(400, 'User not found.')
        const lp = lpSnap.data() as User

        const contractDoc = firestore.doc(`contracts/${contractId}`)
        const contractSnap = await trans.get(contractDoc)
        if (!contractSnap.exists) throw new APIError(400, 'Contract not found.')
        const contract = contractSnap.data() as CPMMContract

        const liquidityCollection = firestore.collection(
          `contracts/${contractId}/liquidity`
        )

        const liquiditiesSnap = await trans.get(liquidityCollection)

        const liquidities = liquiditiesSnap.docs.map(
          (doc) => doc.data() as LiquidityProvision
        )

        const userShares = getUserLiquidityShares(userId, contract, liquidities)

        // zero all added amounts for now
        // can add support for partial withdrawals in the future
        liquiditiesSnap.docs
          .filter(
            (_, i) => !liquidities[i].isAnte && liquidities[i].userId === userId
          )
          .forEach((doc) => trans.update(doc.ref, { amount: 0 }))

        const payout = Math.min(...Object.values(userShares))
        if (payout <= 0) return {}

        const newBalance = lp.balance + payout
        trans.update(lpDoc, { balance: newBalance })

        const newPool = subtractObjects(contract.pool, userShares)
        const newTotalLiquidity = contract.totalLiquidity - payout
        trans.update(contractDoc, {
          pool: newPool,
          totalLiquidity: newTotalLiquidity,
        })

        const prob = getProbability(contract)

        // surplus shares become user's bets
        const bets = Object.entries(userShares)
          .map(([outcome, shares]) =>
            shares - payout < 1 // don't create bet if less than 1 share
              ? undefined
              : ({
                  userId: userId,
                  contractId: contract.id,
                  amount: shares - payout,
                  shares: shares - payout,
                  outcome,
                  probBefore: prob,
                  probAfter: prob,
                  createdTime: Date.now(),
                  fees: noFees,
                } as Omit<Bet, 'id'>)
          )
          .filter((x) => x !== undefined)

        for (let bet of bets) {
          const doc = firestore
            .collection(`contracts/${contract.id}/bets`)
            .doc()
          trans.create(doc, { id: doc.id, ...bet })
        }

        return userShares
      })

      console.log(userId, 'withrdaws', result)
      return result
    }
  )

const firestore = admin.firestore()
