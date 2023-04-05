import * as admin from 'firebase-admin'
import { z } from 'zod'

import { Contract, CPMMContract } from 'common/contract'
import { User } from 'common/user'
import { getNewLiquidityProvision } from 'common/add-liquidity'
import { APIError, authEndpoint, validate } from './helpers'

const bodySchema = z.object({
  contractId: z.string(),
  amount: z.number().gt(0),
})

export const addsubsidy = authEndpoint(async (req, auth) => {
  const { amount, contractId } = validate(bodySchema, req.body)

  if (!isFinite(amount) || amount < 1) throw new APIError(400, 'Invalid amount')

  // run as transaction to prevent race conditions
  return await firestore.runTransaction(async (transaction) => {
    const userDoc = firestore.doc(`users/${auth.uid}`)
    const userSnap = await transaction.get(userDoc)
    if (!userSnap.exists) throw new APIError(400, 'User not found')
    const user = userSnap.data() as User

    const contractDoc = firestore.doc(`contracts/${contractId}`)
    const contractSnap = await transaction.get(contractDoc)
    if (!contractSnap.exists) throw new APIError(400, 'Invalid contract')
    const contract = contractSnap.data() as Contract
    if (contract.mechanism !== 'cpmm-1')
      throw new APIError(400, 'Invalid contract, only cpmm-1 is supported')

    const { closeTime } = contract
    if (closeTime && Date.now() > closeTime)
      throw new APIError(400, 'Trading is closed')

    if (user.balance < amount) throw new APIError(400, 'Insufficient balance')

    const newLiquidityProvisionDoc = firestore
      .collection(`contracts/${contractId}/liquidity`)
      .doc()

    const { newLiquidityProvision, newTotalLiquidity, newSubsidyPool } =
      getNewLiquidityProvision(
        user.id,
        amount,
        contract,
        newLiquidityProvisionDoc.id
      )

    transaction.update(contractDoc, {
      subsidyPool: newSubsidyPool,
      totalLiquidity: newTotalLiquidity,
    } as Partial<CPMMContract>)

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
})

const firestore = admin.firestore()
