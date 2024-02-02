import * as admin from 'firebase-admin'

import { createSupabaseDirectClient } from 'shared/supabase/init'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers/endpoint'
import { AD_REDEEM_REWARD } from 'common/boost'
import { FieldValue } from 'firebase-admin/firestore'
import { MarketAdRedeemFeeTxn, MarketAdRedeemTxn } from 'common/txn'
import { insertTxns } from 'shared/txn/run-txn'

const schema = z
  .object({
    adId: z.string(),
  })
  .strict()

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
  await pg.tx(async (tx) => {
    // first check if user has redeemed before
    const oldTxn = await tx.oneOrNone(
      `select 1 from txns
      where data->>category = 'MARKET_BOOST_REDEEM'
      and data->>fromId = $1
      and data->>toId = $2`,
      [adId, auth.uid]
    )

    if (oldTxn) {
      throw new APIError(
        403,
        `You have already redeemed the boost for this market`
      )
    }

    await tx.none(
      `update market_ads 
      set funds = funds - $1
      where id = $2`,
      [cost, adId]
    )
    const reward = AD_REDEEM_REWARD

    await insertTxns(
      tx,
      {
        category: 'MARKET_BOOST_REDEEM',
        fromType: 'AD',
        fromId: adId,
        toType: 'USER',
        toId: auth.uid,
        amount: reward,
        token: 'M$',
        description: 'Redeeming market ad',
        createdTime: Date.now(),
      } as MarketAdRedeemTxn,
      {
        category: 'MARKET_BOOST_REDEEM_FEE',
        fromType: 'AD',
        fromId: adId,
        toType: 'BANK',
        toId: 'BANK',
        amount: cost - reward,
        token: 'M$',
        description: 'Manifold fee for redeeming market ad',
        createdTime: Date.now(),
      } as MarketAdRedeemFeeTxn
    )

    const toUser = firestore.doc(`users/${auth.uid}`)
    toUser.update({
      balance: FieldValue.increment(reward),
      totalDeposits: FieldValue.increment(reward),
    })
  })

  return { status: 'success' }
})
