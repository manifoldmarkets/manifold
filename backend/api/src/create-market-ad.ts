import * as admin from 'firebase-admin'

import { createSupabaseDirectClient } from 'shared/supabase/init'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'
import { runTxn } from 'shared/run-txn'
import { MarketAdCreateTxn } from 'common/txn'

const schema = z.object({
  marketId: z.string(),
  totalCost: z.number(),
  costPerView: z.number(),
})

const pg = createSupabaseDirectClient()

export const createmarketad = authEndpoint(async (req, auth) => {
  const { marketId, totalCost, costPerView } = validate(schema, req.body)

  const embedding = await pg.one(
    `select embedding
    from contract_embeddings
    where contract_id = $1`,
    [marketId]
  )

  pg.connect()
  const firestore = admin.firestore()

  pg.tx(async (t) => {
    const id = await t.one(
      `insert into market_ads 
      (user_id, market_id, targeting_vector, funds, cost_per_view)
      values ($1, $2, $3, $4, $5)
      returning id`,
      [auth.uid, marketId, embedding, totalCost, costPerView]
    )

    await t.none(
      `insert into ad_analytics
      ad_id values $1`,
      id
    )

    // use supabase to add txn from user to the ad. deduct from user
    await firestore.runTransaction(async (trans) => {
      const result = await runTxn(trans, {
        category: 'MARKET_BOOST_CREATE',
        fromType: 'USER',
        fromId: auth.uid,
        toType: 'AD',
        toId: id,
        amount: totalCost,
        token: 'M$',
        description: 'Creating market ad',
      } as MarketAdCreateTxn)

      if (result.status == 'error') {
        throw new APIError(500, result.message ?? 'An unknown error occurred')
      }
    })
  })

  // return something
  return { hi: 'mom' }
})
