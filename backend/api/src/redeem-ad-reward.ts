import { Ad } from 'common/ad'
import { AdRedeemTxn } from 'common/txn'
import { DAY_MS } from 'common/util/time'
import * as admin from 'firebase-admin'
import { sumBy } from 'lodash'
import { runRedeemAdRewardTxn } from 'shared/run-txn'
import { createSupabaseDirectClient } from 'shared/supabase/init'
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

  const ad = post.data() as Ad

  // calculate total funds from txns
  const pg = createSupabaseDirectClient()
  const txns = await pg.map(
    `select data from txns
       where data->>'category' = 'AD_REDEEM'
       and data->>'fromId' = $1`,
    [ad.id],
    (r) => r.data as AdRedeemTxn
  )

  const lastRedeemTime = Math.max(
    ...txns.filter((txn) => txn.toId === user.id).map((txn) => txn.createdTime)
  )

  if (Date.now() - lastRedeemTime < DAY_MS) {
    throw new APIError(403, 'Not allowed to redeem ad more than once a day')
  }

  const spent = sumBy(txns, 'amount')

  const { funds, totalCost, costPerView } = ad
  const calcFunds = totalCost - spent

  if (funds != calcFunds) {
    console.warn(
      `funds was ${funds} but according to txns but ${spent} spent and there's ${calcFunds} left`
    )
  }

  if (calcFunds < costPerView) {
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
