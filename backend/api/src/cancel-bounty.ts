import * as admin from 'firebase-admin'
import { createBountyCanceledNotification } from 'shared/create-notification'
import { runCancelBountyTxn } from 'shared/txn/run-bounty-txn'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'
import { Contract } from 'common/contract'

const bodySchema = z
  .object({
    contractId: z.string(),
  })
  .strict()

export const cancelbounty = authEndpoint(async (req, auth) => {
  const { contractId } = validate(bodySchema, req.body)

  // run as transaction to prevent race conditions
  return await firestore.runTransaction(async (transaction) => {
    const contractDoc = firestore.doc(`contracts/${contractId}`)
    const contractSnap = await transaction.get(contractDoc)
    if (!contractSnap.exists) throw new APIError(404, 'Contract not found')
    const contract = contractSnap.data() as Contract

    if (
      contract.mechanism !== 'none' ||
      contract.outcomeType != 'BOUNTIED_QUESTION'
    )
      throw new APIError(403, 'This is contract not a bounty')

    if (contract?.creatorId !== auth.uid)
      throw new APIError(403, 'You are not allowed to cancel this bounty')

    const userDoc = firestore.doc(`users/${auth.uid}`)

    const bountyLeft = contract.bountyLeft

    const { txn } = await runCancelBountyTxn(
      transaction,
      {
        category: 'BOUNTY_CANCELED',
        fromId: contractId,
        fromType: 'CONTRACT',
        toId: auth.uid,
        toType: 'USER',
        token: 'M$',
        amount: bountyLeft,
      },
      contractDoc,
      userDoc,
      contract.closeTime
    )

    await createBountyCanceledNotification(contract, bountyLeft)
    return txn
  })
})

const firestore = admin.firestore()
