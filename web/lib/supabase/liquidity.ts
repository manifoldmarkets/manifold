import { db } from 'common/src/supabase/db'
import { convertLiquidity } from 'common/supabase/liquidity'
import { sortBy } from 'lodash'

export const getLiquidityDocs = async (contractId: string) => {
  const { data, error } = await db
    .from('contract_liquidity')
    .select('*')
    .eq('contract_id', contractId)

  if (error) {
    console.error(error)
    return undefined
  }

  return sortBy(data.map(convertLiquidity), (l) => l.createdTime)
}
