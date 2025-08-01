import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { Contract, contractUrl } from 'common/contract'
import {
  BOOST_COST_MANA,
  DEV_BOOST_STRIPE_PRICE_ID,
  PROD_BOOST_STRIPE_PRICE_ID,
} from 'common/economy'
import { isAdminId, isModId } from 'common/envs/constants'
import { Row } from 'common/supabase/utils'
import { TopLevelPost } from 'common/top-level-post'
import { ContractBoostPurchaseTxn } from 'common/txn'
import { DAY_MS } from 'common/util/time'
import { trackPublicEvent } from 'shared/analytics'
import { boostContractImmediately } from 'shared/supabase/contracts'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { getPost } from 'shared/supabase/posts'
import { runTxnInBetQueue, TxnData } from 'shared/txn/run-txn'
import { getContract, isProd } from 'shared/utils'
import Stripe from 'stripe'
import { APIError, APIHandler } from './helpers/endpoint'

const MAX_ACTIVE_BOOSTS = 5

const initStripe = () => {
  const apiKey = process.env.STRIPE_APIKEY as string
  return new Stripe(apiKey, { apiVersion: '2020-08-27', typescript: true })
}

//TODO; we could add a 'paid' column that is default true but for those paying with USD,
// defaults to false until the strpe webhook marks it as true
export const purchaseContractBoost: APIHandler<'purchase-boost'> = async (
  props,
  auth
) => {
  const { contractId, postId, startTime, method } = props
  const userId = auth.uid

  const pg = createSupabaseDirectClient()

  // Validate that either contract or post exists and user can see it
  let contract: Contract | undefined = undefined
  let post: TopLevelPost | null = null
  let contentUrl = ''
  let contentSlug = ''

  if (contractId) {
    contract = await getContract(pg, contractId)
    if (!contract) {
      throw new APIError(404, 'Contract not found')
    }
    contentUrl = contractUrl(contract)
    contentSlug = contract.slug
  } else if (postId) {
    post = await getPost(pg, postId)
    if (!post) {
      throw new APIError(404, 'Post not found')
    }
    contentUrl = `/post/${post.slug}`
    contentSlug = post.slug
  }

  const fundViaCash = method === 'cash'
  const freeAdminBoost = method === 'admin-free'

  // Check if user is admin/mod for free boost
  if (freeAdminBoost && !isAdminId(userId) && !isModId(userId)) {
    throw new APIError(403, 'Only admins and mods can use free boosts')
  }

  // Check if there's already an active boost for the same time period
  const activeBoost = await pg.manyOrNone<Row<'contract_boosts'>>(
    `select * from contract_boosts 
     where millis_to_ts($1) between start_time and end_time
     and funded`,
    [startTime]
  )

  // Check if the specific content (contract or post) already has a boost for this time
  const contentHasBoost = activeBoost.some(
    (b) =>
      (contractId && b.contract_id === contractId) ||
      (postId && b.post_id === postId)
  )

  if (contentHasBoost) {
    throw new APIError(
      400,
      `${
        contractId ? 'Contract' : 'Post'
      } already has an active boost for that time`
    )
  }

  if (activeBoost.length >= MAX_ACTIVE_BOOSTS) {
    throw new APIError(
      400,
      'That time period has the maximum number of boosts. Please select a different time.'
    )
  }

  if (fundViaCash) {
    // insert the boost as unfunded and then in the stripe endpoint, query for the boost and mark it as funded
    const boost = await pg.one(
      `insert into contract_boosts (contract_id, post_id, user_id, start_time, end_time, funded)
       values ($1, $2, $3, millis_to_ts($4), millis_to_ts($5), false)
       returning id`,
      [
        contractId ?? null,
        postId ?? null,
        userId,
        startTime,
        startTime + DAY_MS,
      ]
    )

    // Create Stripe checkout session
    const stripe = initStripe()
    const priceId = isProd()
      ? PROD_BOOST_STRIPE_PRICE_ID
      : DEV_BOOST_STRIPE_PRICE_ID

    const session = await stripe.checkout.sessions.create({
      metadata: {
        userId,
        boostId: boost.id,
        contractId: contractId ?? '',
        postId: postId ?? '',
      },
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'payment',
      allow_promotion_codes: true,
      success_url: contentUrl + '?boostSuccess=true',
      cancel_url: contentUrl + '?boostSuccess=false',
    })
    if (!session.url) {
      throw new APIError(500, 'Failed to create Stripe checkout session')
    }

    return {
      result: { success: true, checkoutUrl: session.url },
      continue: async () => {
        trackPublicEvent(
          auth.uid,
          `${contractId ? 'contract' : 'post'} boost initiated`,
          {
            contractId,
            postId,
            slug: contentSlug,
            paymentMethod: 'cash',
          }
        )
      },
    }
  } else {
    // Start transaction for mana payment
    await pg.tx(async (tx) => {
      const boost = await tx.one(
        `insert into contract_boosts (contract_id, post_id, user_id, start_time, end_time, funded)
       values ($1, $2, $3, millis_to_ts($4), millis_to_ts($5), true)
       returning id`,
        [
          contractId ?? null,
          postId ?? null,
          userId,
          startTime,
          startTime + DAY_MS,
        ]
      )
      if (!freeAdminBoost) {
        const txnData: TxnData = {
          category: 'CONTRACT_BOOST_PURCHASE',
          fromType: 'USER',
          toType: 'BANK',
          token: 'M$',
          data: { contractId, postId, boostId: boost.id },
          amount: BOOST_COST_MANA,
          fromId: userId,
          toId: isProd()
            ? HOUSE_LIQUIDITY_PROVIDER_ID
            : DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
        } as ContractBoostPurchaseTxn
        await runTxnInBetQueue(tx, txnData)
      }
    })
  }

  return {
    result: { success: true },
    continue: async () => {
      trackPublicEvent(
        auth.uid,
        `${contractId ? 'contract' : 'post'} boost purchased`,
        {
          contractId,
          postId,
          slug: contentSlug,
          paymentMethod: 'mana',
        }
      )
      if (startTime <= Date.now() && !fundViaCash && contract) {
        await boostContractImmediately(pg, contract)
      }
      if (startTime <= Date.now() && !fundViaCash && post) {
        await boostPostImmediately(pg, post)
      }
    },
  }
}

export const boostPostImmediately = async (
  pg: SupabaseDirectClient,
  post: TopLevelPost
) => {
  await pg.none(
    `update old_posts set boosted = true, importance_score = 0.9 where id = $1`,
    [post.id]
  )
}
