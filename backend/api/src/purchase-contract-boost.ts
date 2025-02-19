import { APIError, APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { DAY_MS } from 'common/util/time'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { getContract, isProd } from 'shared/utils'
import { runTxnInBetQueue, TxnData } from 'shared/txn/run-txn'
import { ContractBoostPurchaseTxn } from 'common/txn'
import { Row } from 'common/supabase/utils'
import {
  BOOST_COST_MANA,
  DEV_BOOST_STRIPE_PRICE_ID,
  PROD_BOOST_STRIPE_PRICE_ID,
} from 'common/economy'
import { trackPublicEvent } from 'shared/analytics'
import Stripe from 'stripe'
import { contractUrl } from 'common/contract'
import { boostContractImmediately } from 'shared/supabase/contracts'

const MAX_ACTIVE_BOOSTS = 5

const initStripe = () => {
  const apiKey = process.env.STRIPE_APIKEY as string
  return new Stripe(apiKey, { apiVersion: '2020-08-27', typescript: true })
}

//TODO; we could add a 'paid' column that is default true but for those paying with USD,
// defaults to false until the strpe webhook marks it as true
export const purchaseContractBoost: APIHandler<
  'purchase-contract-boost'
> = async (props, auth) => {
  const { contractId, startTime, method } = props
  const userId = auth.uid

  const pg = createSupabaseDirectClient()

  // Check if contract exists and user can see it
  const contract = await getContract(pg, contractId)
  if (!contract) {
    throw new APIError(404, 'Contract not found')
  }
  const fundViaCash = method === 'cash'

  // Check if there's already an active boost
  const activeBoost = await pg.manyOrNone<Row<'contract_boosts'>>(
    `select * from contract_boosts 
     where millis_to_ts($1) between start_time and end_time
     and funded`,
    [startTime]
  )
  if (activeBoost.some((b) => b.contract_id === contractId)) {
    throw new APIError(
      400,
      'Contract already has an active boost for that time'
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
      `insert into contract_boosts (contract_id, user_id, start_time, end_time, funded)
       values ($1, $2, millis_to_ts($3), millis_to_ts($4), false)
       returning id`,
      [contractId, userId, startTime, startTime + DAY_MS]
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
        contractId,
      },
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'payment',
      allow_promotion_codes: true,
      success_url: contractUrl(contract) + '?boostSuccess=true',
      cancel_url: contractUrl(contract) + '?boostSuccess=false',
    })
    if (!session.url) {
      throw new APIError(500, 'Failed to create Stripe checkout session')
    }

    return {
      result: { success: true, checkoutUrl: session.url },
      continue: async () => {
        trackPublicEvent(auth.uid, 'contract boost initiated', {
          contractId,
          slug: contract.slug,
          paymentMethod: 'cash',
        })
      },
    }
  } else {
    // Start transaction
    await pg.tx(async (tx) => {
      const boost = await tx.one(
        `insert into contract_boosts (contract_id, user_id, start_time, end_time, funded)
       values ($1, $2, millis_to_ts($3), millis_to_ts($4), true)
       returning id`,
        [contractId, userId, startTime, startTime + DAY_MS]
      )

      // Charge mana
      const txnData: TxnData = {
        category: 'CONTRACT_BOOST_PURCHASE',
        fromType: 'USER',
        toType: 'BANK',
        token: 'M$',
        data: { contractId, boostId: boost.id },
        amount: BOOST_COST_MANA,
        fromId: userId,
        toId: isProd()
          ? HOUSE_LIQUIDITY_PROVIDER_ID
          : DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
      } as ContractBoostPurchaseTxn

      await runTxnInBetQueue(tx, txnData)
    })
  }

  return {
    result: { success: true },
    continue: async () => {
      trackPublicEvent(auth.uid, 'contract boost purchased', {
        contractId,
        slug: contract.slug,
        paymentMethod: 'mana',
      })
      if (startTime <= Date.now() && !fundViaCash)
        await boostContractImmediately(pg, contract)
    },
  }
}
