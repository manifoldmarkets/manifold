import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from './helpers/endpoint'
import { rowToPerpPosition } from 'shared/perps/queries'

export const getPerpPositions: APIHandler<'get-perp-positions'> = async (
  body
) => {
  const { contractId, userId } = body
  const pg = createSupabaseDirectClient()
  const rows = userId
    ? await pg.manyOrNone(
        `select * from contract_perp_positions where contract_id = $1 and user_id = $2`,
        [contractId, userId]
      )
    : await pg.manyOrNone(
        `select * from contract_perp_positions where contract_id = $1`,
        [contractId]
      )
  return rows.map((r) => {
    const p = rowToPerpPosition(r)
    return {
      userId: p.userId,
      direction: p.direction,
      size: p.size,
      costBasis: p.costBasis,
      originalCostBasis: p.originalCostBasis,
      entryPrice: p.entryPrice,
      leverage: p.leverage,
      liquidationPrice: p.liquidationPrice,
    }
  })
}
