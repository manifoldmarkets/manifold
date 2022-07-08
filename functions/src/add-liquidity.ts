import * as admin from 'firebase-admin'
import { z } from 'zod'

import { Contract } from '../../common/contract'
import { User } from '../../common/user'
import { removeUndefinedProps } from '../../common/util/object'
import { redeemShares } from './redeem-shares'
import { getNewLiquidityProvision } from '../../common/add-liquidity'
import { APIError, newEndpoint, validate } from './api'

const bodySchema = z.object({
  contractId: z.string(),
  amount: z.number().gt(0),
})

export const addliquidity = newEndpoint({}, async (req, auth) => {
  const { amount, contractId } = validate(bodySchema, req.body)

  if (!isFinite(amount)) throw new APIError(400, 'Invalid amount')

  // run as transaction to prevent race conditions
  return await firestore
    .runTransaction(async (transaction) => {
      const userDoc = firestore.doc(`users/${auth.uid}`)
      const userSnap = await transaction.get(userDoc)
      if (!userSnap.exists) throw new APIError(400, 'User not found')
      const user = userSnap.data() as User

      const contractDoc = firestore.doc(`contracts/${contractId}`)
      const contractSnap = await transaction.get(contractDoc)
      if (!contractSnap.exists) throw new APIError(400, 'Invalid contract')
      const contract = contractSnap.data() as Contract
      if (
        contract.mechanism !== 'cpmm-1' ||
        (contract.outcomeType !== 'BINARY' &&
          contract.outcomeType !== 'PSEUDO_NUMERIC')
      )
        throw new APIError(400, 'Invalid contract')

      const { closeTime } = contract
      if (closeTime && Date.now() > closeTime)
        throw new APIError(400, 'Trading is closed')

      if (user.balance < amount) throw new APIError(400, 'Insufficient balance')

      const newLiquidityProvisionDoc = firestore
        .collection(`contracts/${contractId}/liquidity`)
        .doc()

      const { newLiquidityProvision, newPool, newP, newTotalLiquidity } =
        getNewLiquidityProvision(
          user,
          amount,
          contract,
          newLiquidityProvisionDoc.id
        )

      if (newP !== undefined && !isFinite(newP)) {
        return {
          status: 'error',
          message: 'Liquidity injection rejected due to overflow error.',
        }
      }

      transaction.update(
        contractDoc,
        removeUndefinedProps({
          pool: newPool,
          p: newP,
          totalLiquidity: newTotalLiquidity,
        })
      )

      const newBalance = user.balance - amount
      const newTotalDeposits = user.totalDeposits - amount

      if (!isFinite(newBalance)) {
        throw new APIError(500, 'Invalid user balance for ' + user.username)
      }

      transaction.update(userDoc, {
        balance: newBalance,
        totalDeposits: newTotalDeposits,
      })

      transaction.create(newLiquidityProvisionDoc, newLiquidityProvision)

      return newLiquidityProvision
    })
    .then(async (result) => {
      await redeemShares(auth.uid, contractId)
      return result
    })
})

const firestore = admin.firestore()
