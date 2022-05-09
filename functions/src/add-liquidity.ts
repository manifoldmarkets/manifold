import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { Contract } from 'common/contract'
import { User } from 'common/user'
import { removeUndefinedProps } from 'common/util/object'
import { redeemShares } from './redeem-shares'
import { getNewLiquidityProvision } from 'common/add-liquidity'

export const addLiquidity = functions.runWith({ minInstances: 1 }).https.onCall(
  async (
    data: {
      amount: number
      contractId: string
    },
    context
  ) => {
    const userId = context?.auth?.uid
    if (!userId) return { status: 'error', message: 'Not authorized' }

    const { amount, contractId } = data

    if (amount <= 0 || isNaN(amount) || !isFinite(amount))
      return { status: 'error', message: 'Invalid amount' }

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
        if (
          contract.mechanism !== 'cpmm-1' ||
          contract.outcomeType !== 'BINARY'
        )
          return { status: 'error', message: 'Invalid contract' }

        const { closeTime } = contract
        if (closeTime && Date.now() > closeTime)
          return { status: 'error', message: 'Trading is closed' }

        if (user.balance < amount)
          return { status: 'error', message: 'Insufficient balance' }

        const newLiquidityProvisionDoc = firestore
          .collection(`contracts/${contractId}/liquidity`)
          .doc()

        const {
          newLiquidityProvision,
          newPool,
          newP,
          newBalance,
          newTotalLiquidity,
        } = getNewLiquidityProvision(
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

        if (!isFinite(newBalance)) {
          throw new Error('Invalid user balance for ' + user.username)
        }

        transaction.update(userDoc, { balance: newBalance })

        transaction.create(newLiquidityProvisionDoc, newLiquidityProvision)

        return { status: 'success', newLiquidityProvision }
      })
      .then(async (result) => {
        await redeemShares(userId, contractId)
        return result
      })
  }
)

const firestore = admin.firestore()
