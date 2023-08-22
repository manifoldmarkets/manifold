import * as admin from 'firebase-admin'

import { createSupabaseDirectClient } from 'shared/supabase/init'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'
import { AD_REDEEM_REWARD } from 'common/boost'
import { FieldValue } from 'firebase-admin/firestore'
import { MarketAdRedeemFeeTxn, MarketAdRedeemTxn } from 'common/txn'

const schema = z.object({
  adId: z.string(),
})

export const redeemboost = authEndpoint(async (req, auth) => {
  const { adId } = validate(schema, req.body)
  const pg = createSupabaseDirectClient()

  const firestore = admin.firestore()

  // find the advertisement
  const data = await pg.one(
    `select cost_per_view::numeric, funds::numeric from market_ads
    where id = $1`,
    [adId]
  )

  const cost = parseFloat(data.cost_per_view)
  const funds = parseFloat(data.funds)

  if (funds < cost) {
    throw new APIError(
      403,
      'Ad for market does not have enough funds to pay out'
    )
  }

  // create the redeem txn
  const result = await firestore.runTransaction(async (trans) => {
    // first check if user has redeemed before, in firestore.
    // we check in this transaction to prevent double redeems via race condition
    const oldTxn = await trans.get(
      firestore
        .collection('txns')
        .where('category', '==', 'MARKET_BOOST_REDEEM')
        .where('fromId', '==', adId)
        .where('toId', '==', auth.uid)
    )

    if (oldTxn.docs.length > 0) {
      throw new APIError(
        403,
        `You have already redeemed the boost for this market ${oldTxn.docs.length} times`
      )
    }

    const pg = createSupabaseDirectClient()

    await pg.none(
      `update market_ads 
      set funds = funds - $1
      where id = $2`,
      [cost, adId]
    )

    const txnColl = firestore.collection(`txns/`)

    const reward = AD_REDEEM_REWARD

    const toUserDoc = firestore.doc(`users/${auth.uid}`)
    trans.update(toUserDoc, {
      balance: FieldValue.increment(reward),
      totalDeposits: FieldValue.increment(reward),
    })

    txnColl.add({
      category: 'MARKET_BOOST_REDEEM',
      fromType: 'AD',
      fromId: adId,
      toType: 'USER',
      toId: auth.uid,
      amount: reward,
      token: 'M$',
      description: 'Redeeming market ad',
      createdTime: Date.now(),
    } as MarketAdRedeemTxn)

    txnColl.add({
      category: 'MARKET_BOOST_REDEEM_FEE',
      fromType: 'AD',
      fromId: adId,
      toType: 'BANK',
      toId: 'BANK',
      amount: cost - reward,
      token: 'M$',
      description: 'Manifold fee for redeeming market ad',
      createdTime: Date.now(),
    } as MarketAdRedeemFeeTxn)

    return { status: 'success' }
  })

  if (result.status == 'error') {
    throw new APIError(500, 'An unknown error occurred')
  }

  return result
})
