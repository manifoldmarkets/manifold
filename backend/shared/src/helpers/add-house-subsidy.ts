import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { CPMMContract, CPMMMultiContract } from 'common/contract'
import { getNewLiquidityProvision } from 'common/add-liquidity'
import { APIError } from 'common/api/utils'
import { runTxnFromBank } from 'shared/txn/run-txn'

const firestore = admin.firestore()

export const addHouseSubsidy = (contractId: string, amount: number) => {
  return firestore.runTransaction(async (transaction) => {
    const contractDoc = firestore.doc(`contracts/${contractId}`)
    const snap = await transaction.get(contractDoc)
    const contract = snap.data() as CPMMContract | CPMMMultiContract

    const { newTotalLiquidity, newSubsidyPool } = getNewLiquidityProvision(
      amount,
      contract
    )

    const { status, message, txn } = await runTxnFromBank(transaction, {
      fromType: 'BANK',
      amount,
      toId: contractId,
      toType: 'CONTRACT',
      category: 'ADD_SUBSIDY',
      token: 'M$',
    })

    if (status === 'error') {
      throw new APIError(500, message ?? 'Unknown error')
    }

    transaction.update(contractDoc, {
      subsidyPool: newSubsidyPool,
      totalLiquidity: newTotalLiquidity,
    } as Partial<CPMMContract>)

    return txn
  })
}

export const addHouseSubsidyToAnswer = (
  contractId: string,
  answerId: string,
  amount: number
) => {
  return firestore.runTransaction(async (transaction) => {
    const contractDoc = firestore.doc(`contracts/${contractId}`)

    const { status, message, txn } = await runTxnFromBank(transaction, {
      fromType: 'BANK',
      amount,
      toId: contractId,
      toType: 'CONTRACT',
      category: 'ADD_SUBSIDY',
      token: 'M$',
      data: { answerId },
    })

    if (status === 'error') {
      throw new APIError(500, message ?? 'Unknown error')
    }

    transaction.update(contractDoc, {
      totalLiquidity: FieldValue.increment(amount),
    })

    const answerDoc = firestore.doc(
      `contracts/${contractId}/answersCpmm/${answerId}`
    )
    transaction.update(answerDoc, {
      totalLiquidity: FieldValue.increment(amount),
      subsidyPool: FieldValue.increment(amount),
    })

    return txn
  })
}
