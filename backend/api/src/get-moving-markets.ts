import { APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { Contract } from 'common/contract'

// Define interface for the query result row
interface QueryResultRow {
  id: string
  prev_val: number
  new_val: number
  movement_time: string
  [key: string]: any // To accommodate all the contract fields
}

export const getMovingMarkets: APIHandler<'get-moving-markets'> = async (
  props
) => {
  const { limit, offset } = props
  const pg = createSupabaseDirectClient()

  const result = await pg.task(async (t) => {
    const rows = await t.query(
      `
      with recent_movements as (
        select distinct on (contract_id)
          contract_id,
          prev_val,
          new_val,
          created_time
        from contract_movement_notifications
        where created_time > now() - interval '48 hours'
        order by contract_id, created_time desc
      )
      select 
        c.*,
        rm.prev_val,
        rm.new_val,
        rm.created_time as movement_time
      from recent_movements rm
      join contracts c on c.id = rm.contract_id
      order by rm.created_time desc
      limit $1 offset $2
    `,
      [limit, offset]
    )

    const contracts: Contract[] = []
    const movements: {
      contractId: string
      prevVal: number
      newVal: number
      createdTime: number
    }[] = []

    rows.forEach((row: QueryResultRow) => {
      const { prev_val, new_val, movement_time, ...contractData } = row

      contracts.push(contractData as Contract)
      movements.push({
        contractId: row.id,
        prevVal: prev_val,
        newVal: new_val,
        createdTime: new Date(movement_time).getTime(),
      })
    })

    return { contracts, movements }
  })

  return result
}
