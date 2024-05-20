import * as admin from 'firebase-admin'
import { CPMMContract } from 'common/contract'
import { getNewLiquidityProvision } from 'common/add-liquidity'
import { APIError, type APIHandler } from './helpers/endpoint'
import { SUBSIDY_FEE } from 'common/economy'
import { insertTxn } from 'shared/txn/run-txn'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getContractSupabase, getUser } from 'shared/utils'
import { incrementBalance } from 'shared/supabase/users'

export const addLiquidity: APIHandler<
  'market/:contractId/add-liquidity'
> = async ({ contractId, amount }, auth) => {
  return addContractLiquidity(contractId, amount, auth.uid)
}

export const addContractLiquidity = async (
  contractId: string,
  amount: number,
  userId: string
) => {
  const pg = createSupabaseDirectClient()

  const contract = await getContractSupabase(contractId)
  if (!contract) throw new APIError(404, 'Contract not found')

  if (contract.mechanism !== 'cpmm-1' && contract.mechanism !== 'cpmm-multi-1')
    throw new APIError(403, 'Only cpmm-1 and cpmm-multi-1 are supported')

  const { closeTime } = contract
  if (closeTime && Date.now() > closeTime)
    throw new APIError(403, 'Trading is closed')

  if (!isFinite(amount)) throw new APIError(400, 'Invalid amount')

  // run as transaction to prevent race conditions
  return await pg.tx(async (tx) => {
    const user = await getUser(userId, tx)
    if (!user) throw new APIError(401, 'Your account was not found')

    if (user.balance < amount) throw new APIError(403, 'Insufficient balance')

    await incrementBalance(tx, userId, {
      balance: -amount,
      totalDeposits: -amount,
    })

    await insertTxn(tx, {
      fromId: userId,
      amount: amount,
      toId: contractId,
      toType: 'CONTRACT',
      category: 'ADD_SUBSIDY',
      token: 'M$',
      fromType: 'USER',
    })

    return await firestore.runTransaction(async (transaction) => {
      const contractDoc = firestore.doc(`contracts/${contractId}`)

      const newLiquidityProvisionDoc = firestore
        .collection(`contracts/${contractId}/liquidity`)
        .doc()

      const subsidyAmount = (1 - SUBSIDY_FEE) * amount

      const { newLiquidityProvision, newTotalLiquidity, newSubsidyPool } =
        getNewLiquidityProvision(
          userId,
          subsidyAmount,
          contract,
          newLiquidityProvisionDoc.id
        )

      transaction.update(contractDoc, {
        subsidyPool: newSubsidyPool,
        totalLiquidity: newTotalLiquidity,
      } as Partial<CPMMContract>)

      transaction.create(newLiquidityProvisionDoc, newLiquidityProvision)
      return newLiquidityProvision
    })
  })
}

const firestore = admin.firestore()
