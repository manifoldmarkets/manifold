import { Ad } from 'common/ad'
import * as admin from 'firebase-admin'
import { runRedeemAdRewardTxn } from 'shared/run-txn'
import { getUser } from 'shared/utils'
import { z } from 'zod'

import { APIError, authEndpoint, validate } from './helpers'

const schema = z.object({
  adId: z.string(),
})

export const redeemad = authEndpoint(async (req, auth) => {
  const firestore = admin.firestore()

  const { adId } = validate(schema, req.body)
  const user = await getUser(auth.uid)
  if (!user)
    throw new APIError(400, 'No user exists with the authenticated user ID')

  const postRef = firestore.collection('posts').doc(adId)
  const post = await postRef.get()

  if (!post.exists) {
    throw new APIError(404, 'Could not find ad')
  }

  const data = post.data() as Ad

  // TODO: calculate this from the txns instead
  const { funds, costPerView } = data
  if (funds < costPerView) {
    throw new APIError(403, 'Ad does not have enough funds to pay out')
  }

  await firestore.runTransaction(async (transaction) => {
    runRedeemAdRewardTxn(transaction, {
      category: 'AD_REDEEM',
      fromType: 'AD',
      fromId: post.id,
      toType: 'USER',
      toId: user.id,
      amount: costPerView,
      token: 'M$',
      description: 'Redeem reward for watching ad',
    })
  })

  return { status: 'success', post }
})
