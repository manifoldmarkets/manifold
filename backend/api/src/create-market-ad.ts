import * as admin from 'firebase-admin'

import { createSupabaseDirectClient } from 'shared/supabase/init'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'
import { MarketAdCreateTxn } from 'common/txn'
import { log } from 'shared/utils'
import { MIN_AD_COST_PER_VIEW } from 'common/boost'
import { runTxn } from 'shared/txn/run-txn'

const schema = z.object({
  marketId: z.string(),
  totalCost: z.number().positive(),
  costPerView: z.number().positive(),
})

export const boostmarket = authEndpoint(async (req, auth) => {
  const { marketId, totalCost, costPerView } = validate(schema, req.body)

  if (costPerView < MIN_AD_COST_PER_VIEW) {
    throw new APIError(
      400,
      `Cost per view must be at least ${MIN_AD_COST_PER_VIEW}`
    )
  }

  if (totalCost < costPerView) {
    throw new APIError(400, `Total cost must be at least ${costPerView}`)
  }

  log('boosting market')
  const pg = createSupabaseDirectClient()

  const { embedding } = await pg.one(
    `select embedding
    from contract_embeddings
    where contract_id = $1`,
    [marketId]
  )

  const firestore = admin.firestore()

  log(
    'got embedding. connected. starting transaction to create market ad or add funds'
  )

  // create if not exists the market ad row
  const { id } = await pg.one(
    `insert into market_ads
      (user_id, market_id, embedding, funds, cost_per_view)
      values ($1, $2, $3, $4, $5)
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
  return { status: 'success', id }
})
