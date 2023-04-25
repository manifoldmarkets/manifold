import * as admin from 'firebase-admin'

import { createSupabaseDirectClient } from 'shared/supabase/init'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'
import { runTxn } from 'shared/run-txn'
import { MarketAdCreateTxn } from 'common/txn'
import { log } from 'shared/utils'

const schema = z.object({
  marketId: z.string(),
  totalCost: z.number(),
  costPerView: z.number(),
})

const pg = createSupabaseDirectClient()

export const boostmarket = authEndpoint(async (req, auth) => {
  const { marketId, totalCost, costPerView } = validate(schema, req.body)
  log('boosting market')

  const { creator_id } = await pg.one(
    `select creator_id
    from contracts
    where id = $1`,
    [marketId]
  )

  if (creator_id !== auth.uid) {
    throw new APIError(403, 'You are not the creator of this market')
  }

  const { embedding } = await pg.one(
    `select embedding
    from contract_embeddings
    where contract_id = $1`,
    [marketId]
  )

  pg.connect()
  const firestore = admin.firestore()

  log(
    'got embedding. connected. starting transaction to create market ad or add funds'
  )

  // create if not exists the market ad row
  const { id } = await pg.one(
    `insert into market_ads
      (user_id, market_id, embedding, funds, cost_per_view)
      values ($1, $2, $3, $4, $5)
      on conflict on constraint market_ads_unique_market_id
      do update set embedding = $3, funds = market_ads.funds + $4, cost_per_view = $5
      returning id`,
    [auth.uid, marketId, embedding, totalCost, costPerView]
  )

  // use supabase to add txn from user to the ad. deducts from user
  try {
    log('starting transaction to deduct funds.')
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
  } catch (e) {
    log('error adding txn! reversing funds to ad.')

    await pg.none(
      `update market_ads
      set funds = market_ads.funds - $1
      where id = $2`,
      [totalCost, id]
    )
    log(`done subtracting ${totalCost} from ad ${id}`)

    throw e
  }

  // return something
  return { status: 'success' }
})
