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
import { BOOST_COST_MANA } from 'common/economy'
import { updateContractNativeColumns } from 'shared/supabase/contracts'
import { trackPublicEvent } from 'shared/analytics'

const MAX_ACTIVE_BOOSTS = 5

export const purchaseContractBoost: APIHandler<
  'purchase-contract-boost'
> = async (props, auth) => {
  const { contractId, startTime } = props
  const userId = auth.uid

  const pg = createSupabaseDirectClient()

  // Check if contract exists and user can see it
  const contract = await getContract(pg, contractId)
  if (!contract) {
    throw new APIError(404, 'Contract not found')
  }

  // Check if there's already an active boost
  const activeBoost = await pg.manyOrNone<Row<'contract_boosts'>>(
    `select * from contract_boosts 
     where millis_to_ts($1) between start_time and end_time`,
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

  // Start transaction
  await pg.tx(async (tx) => {
    const boost = await tx.one(
      `insert into contract_boosts (contract_id, user_id, start_time, end_time)
       values ($1, $2, millis_to_ts($3), millis_to_ts($4))
       returning *`,
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

  return {
    result: { success: true },
    continue: async () => {
      trackPublicEvent(auth.uid, 'contract boost purchased', {
        contractId,
        slug: contract.slug,
      })
      if (startTime <= Date.now()) {
        await updateContractNativeColumns(pg, contractId, {
          boosted: true,
          importance_score: Math.min(
            Math.max(contract.importanceScore + 0.5, 0.9),
            1
          ),
        })
      }
    },
  }
}
