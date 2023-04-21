import * as admin from 'firebase-admin'

import { runRedeemBoostTxn } from 'shared/run-txn'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'

const schema = z.object({
  adId: z.string(),
})

const pg = createSupabaseDirectClient()

export const redeemboost = authEndpoint(async (req, auth) => {
  const { adId } = validate(schema, req.body)

  pg.connect()
  const firestore = admin.firestore()

  // find the advertisement
  const [reward, total] = await pg.one(
    `select costPerView, totalFunds from market_ads
    where id=$1`,
    [adId]
  )

  if (total < reward) {
    throw new APIError(
      403,
      'Ad for market does not have enough funds to pay out'
    )
  }

  // create the redeem txn
  const result = await firestore.runTransaction(async (trans) =>
    runRedeemBoostTxn(trans, {
      category: 'MARKET_BOOST_REDEEM',
      fromType: 'AD',
      fromId: adId,
      toType: 'USER',
      toId: auth.uid,
      amount: reward,
      token: 'M$',
      description: 'Redeeming market ad',
    })
  )

  if (result.status == 'error') {
    throw new APIError(500, 'An unknown error occurred')
  }

  // return the txn
  return result
})
