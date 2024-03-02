import * as admin from 'firebase-admin'

import { createSupabaseDirectClient } from 'shared/supabase/init'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers/endpoint'
import { MarketAdCreateTxn } from 'common/txn'
import { getContractSupabase } from 'shared/utils'
import { MIN_AD_COST_PER_VIEW } from 'common/boost'
import { runTxn } from 'shared/txn/run-txn'
import { generateContractEmbeddings } from 'shared/supabase/contracts'

const schema = z
  .object({
    marketId: z.string(),
    totalCost: z.number().positive(),
    costPerView: z.number().positive().min(MIN_AD_COST_PER_VIEW),
  })
  .strict()

export const boostmarket = authEndpoint(async (req, auth, log) => {
  const { marketId, totalCost, costPerView } = validate(schema, req.body)

  if (totalCost < costPerView) {
    throw new APIError(400, `Total cost must be at least ${costPerView}`)
  }

  log('boosting market')
  const pg = createSupabaseDirectClient()

  const contractEmbedding = await pg.oneOrNone(
    `select embedding
    from contract_embeddings
    where contract_id = $1`,
    [marketId]
  )
  let embedding = contractEmbedding?.embedding
  if (!contractEmbedding) {
    log('Error: no embedding found for market. Generating one now.')
    const contract = await getContractSupabase(marketId)
    if (!contract) throw new APIError(404, 'Market not found')
    embedding = (await generateContractEmbeddings(contract, pg)).embedding
    if (!embedding) throw new APIError(500, 'Error generating embedding')
  }
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
        data: {
          contractId: marketId,
        },
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
