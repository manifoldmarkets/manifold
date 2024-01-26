import * as admin from 'firebase-admin'
import { runTxn } from './run-txn'
import { LIKE_COST } from 'common/love/constants'

export async function runLikePurchaseTxn(userId: string, targetId: string) {
  return admin.firestore().runTransaction(async (fbTransaction) => {
    return await runTxn(fbTransaction, {
      amount: LIKE_COST,
      fromId: userId,
      fromType: 'USER',
      toId: 'BANK',
      toType: 'BANK',
      category: 'LIKE_PURCHASE',
      token: 'M$',
      data: { targetId },
    })
  })
}
