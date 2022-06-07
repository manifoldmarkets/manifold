import * as admin from 'firebase-admin'
import { z } from 'zod'

import { CPMMContract } from '../../common/contract'
import { User } from '../../common/user'
import { subtractObjects } from '../../common/util/object'
import { LiquidityProvision } from '../../common/liquidity-provision'
import { getUserLiquidityShares } from '../../common/calculate-cpmm'
import { Bet } from '../../common/bet'
import { getProbability } from '../../common/calculate'
import { noFees } from '../../common/fees'

import { APIError, newEndpoint, validate } from './api'

const bodySchema = z.object({
  contractId: z.string(),
})

export const withdrawLiquidity = newEndpoint(
  ['POST'],
  async (req, [user, _]) => {
    const { contractId } = validate(bodySchema, req.body)

    const result = await firestore.runTransaction(async (trans) => {
      const lpDoc = firestore.doc(`users/${user.id}`)
      const lpSnap = await trans.get(lpDoc)
      if (!lpSnap.exists) throw new APIError(400, 'User not found.')
      const lp = lpSnap.data() as User

      const contractDoc = firestore.doc(`contracts/${contractId}`)
      const contractSnap = await trans.get(contractDoc)
      if (!contractSnap.exists) throw new APIError(400, 'Contract not found.')
      const contract = contractSnap.data() as CPMMContract

      const liquidityCollection = firestore
        .collection(`contracts/${contractId}/liquidity`)
        .where('userId', '==', user.id)

      const liquiditiesSnap = await trans.get(liquidityCollection)

      const liquidities = liquiditiesSnap.docs
        .map((doc) => doc.data() as LiquidityProvision)
        .filter((liq) => !liq.isAnte) // exclude creator's ante

      const userShares = getUserLiquidityShares(user.id, contract, liquidities)

      // zero all added amounts for now
      // can add support for partial withdrawals in the future
      liquiditiesSnap.docs.forEach((doc) =>
        trans.update(doc.ref, { amount: 0 })
      )

      const payout = Math.min(...Object.values(userShares))
      if (payout <= 0) return {}

      const newBalance = lp.balance + payout
      trans.update(lpDoc, { balance: newBalance })

      const newPool = subtractObjects(contract.pool, userShares)
      trans.update(contractDoc, { pool: newPool })

      const prob = getProbability(contract)

      // surplus shares become user's bets
      const bets = Object.entries(userShares)
        .map(([outcome, shares]) =>
          shares - payout <= 0
            ? undefined
            : ({
                userId: user.id,
                contractId: contract.id,
                amount: shares - payout,
                shares: shares - payout,
                outcome,
                probBefore: prob,
                probAfter: prob,
                createdTime: Date.now(),
                isRedemption: true,
                fees: noFees,
              } as Omit<Bet, 'id'>)
        )
        .filter((x) => x !== undefined)

      for (let bet of bets) {
        const doc = firestore.collection(`contracts/${contract.id}/bets`).doc()
        trans.create(doc, { id: doc.id, ...bet })
      }

      return userShares
    })

    console.log(user.username, 'withrdaws', result)
    return result
  }
)

const firestore = admin.firestore()
