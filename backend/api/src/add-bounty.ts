import * as admin from 'firebase-admin'
import { createBountyAddedNotification } from 'shared/create-notification'
import { runAddBountyTxn } from 'shared/txn/run-bounty-txn'
import { getContract } from 'shared/utils'
import { typedEndpoint } from './helpers'

export const addBounty = typedEndpoint('add-bounty', async (props, auth) => {
  const { contractId, amount } = props

  // run as transaction to prevent race conditions
  return await firestore.runTransaction(async (transaction) => {
    const txn = await runAddBountyTxn(transaction, {
      fromId: auth.uid,
      fromType: 'USER',
      toId: contractId,
      toType: 'CONTRACT',
      amount,
      token: 'M$',
      category: 'BOUNTY_ADDED',
    })

    const contract = await getContract(contractId)
    if (contract && contract.creatorId !== auth.uid) {
      await createBountyAddedNotification(
        contract.creatorId,
        contract,
        auth.uid,
        amount
      )
    }
    return txn
  })
})

const firestore = admin.firestore()
