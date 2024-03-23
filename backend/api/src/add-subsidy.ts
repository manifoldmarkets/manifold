import * as admin from 'firebase-admin'
import { Contract, CPMMContract } from 'common/contract'
import { User } from 'common/user'
import { getNewLiquidityProvision } from 'common/add-liquidity'
import { APIError, type APIHandler } from './helpers/endpoint'
import { SUBSIDY_FEE } from 'common/economy'
import { runTxn } from 'shared/txn/run-txn'
import { type Txn } from 'common/txn'

export const addLiquidity: APIHandler<
  'market/:contractId/add-liquidity'
> = async ({ contractId, amount }, auth) => {
  // run as transaction to prevent race conditions
  return await firestore.runTransaction(async (transaction) => {
    const userDoc = firestore.doc(`users/${auth.uid}`)
    const userSnap = await transaction.get(userDoc)
    if (!userSnap.exists) throw new APIError(401, 'Your account was not found')
    const user = userSnap.data() as User

    const contractDoc = firestore.doc(`contracts/${contractId}`)
    const contractSnap = await transaction.get(contractDoc)
    if (!contractSnap.exists) throw new APIError(404, 'Contract not found')
    const contract = contractSnap.data() as Contract
    if (
      contract.mechanism !== 'cpmm-1' &&
      contract.mechanism !== 'cpmm-multi-1'
    )
      throw new APIError(
        500,
        'Invalid contract, only cpmm-1 and cpmm-multi-1 are supported'
      )

    const { closeTime } = contract
    if (closeTime && Date.now() > closeTime)
      throw new APIError(403, 'Trading is closed')

    if (user.balance < amount) throw new APIError(403, 'Insufficient balance')

    const subsidyAmount = (1 - SUBSIDY_FEE) * amount

    const { newTotalLiquidity, newSubsidyPool } = getNewLiquidityProvision(
      subsidyAmount,
      contract
    )

    const { status, message, txn } = await runTxn(transaction, {
      fromId: user.id,
      amount: amount,
      toId: contractId,
      toType: 'CONTRACT',
      category: 'ADD_SUBSIDY',
      token: 'M$',
      fromType: 'USER',
    })

    if (status === 'error' || !txn) {
      throw new APIError(500, message ?? 'Unknown error')
    }

    transaction.update(contractDoc, {
      subsidyPool: newSubsidyPool,
      totalLiquidity: newTotalLiquidity,
    } as Partial<CPMMContract>)

    const newBalance = user.balance - amount

    if (!isFinite(newBalance)) {
      throw new APIError(500, 'Invalid user balance for ' + user.username)
    }

    return txn as Txn
  })
}

const firestore = admin.firestore()
