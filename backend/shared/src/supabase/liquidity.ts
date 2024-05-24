import { LiquidityProvision } from 'common/liquidity-provision'
import { insert } from './utils'
import { SupabaseDirectClient } from './init'
import { randomUUID } from 'crypto'
import { removeUndefinedProps } from 'common/util/object'

export const insertLiquidity = async (
  pg: SupabaseDirectClient,
  liquidity: Omit<LiquidityProvision, 'id'>
) => {
  const doc = { id: randomUUID(), ...liquidity }

  return await insert(pg, 'contract_liquidity', {
    liquidity_id: doc.id,
    contract_id: doc.contractId,
    data: JSON.stringify(removeUndefinedProps(doc)) + '::jsonb',
  })
}
