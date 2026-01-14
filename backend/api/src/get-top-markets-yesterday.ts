import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { contractColumnsToSelect } from 'shared/utils'
import { convertContract } from 'common/supabase/contracts'
import { Contract } from 'common/contract'
import { Row } from 'common/supabase/utils'

export const getTopMarketsYesterday: APIHandler<
  'get-top-markets-yesterday'
> = async () => {
  const pg = createSupabaseDirectClient()

  // Get top markets by traders (using uniqueBettorCountDay from contract data)
  const topByTradersRows = await pg.manyOrNone<
    Row<'contracts'> & { traders_yesterday: number }
  >(
    `select ${contractColumnsToSelect}, (data->>'uniqueBettorCountDay')::int as traders_yesterday
     from contracts
     where visibility = 'public'
       and deleted = false
       and (data->>'uniqueBettorCountDay')::int > 0
     order by (data->>'uniqueBettorCountDay')::int desc
     limit 10`
  )

  // Get top markets by page views from yesterday
  // Uses user_view_events which records each view with timestamp
  const topByViewsRows = await pg.manyOrNone<{
    contract_id: string
    view_count: number
  }>(
    `select contract_id, count(*) as view_count
     from user_view_events
     where name = 'page'
       and created_time >= now() - interval '1 day'
     group by contract_id
     order by view_count desc
     limit 10`
  )

  // Fetch full contract data for top viewed markets
  const viewContractIds = topByViewsRows.map((r) => r.contract_id)
  const viewCountByContractId = Object.fromEntries(
    topByViewsRows.map((r) => [r.contract_id, Number(r.view_count)])
  )

  let topByViewsContracts: Contract[] = []
  if (viewContractIds.length > 0) {
    const contractRows = await pg.manyOrNone<Row<'contracts'>>(
      `select ${contractColumnsToSelect}
       from contracts
       where id in ($1:list)
         and visibility = 'public'
         and deleted = false`,
      [viewContractIds]
    )
    topByViewsContracts = contractRows.map(convertContract)
  }

  // Sort by view count (they might be in different order after filtering)
  topByViewsContracts.sort(
    (a, b) =>
      (viewCountByContractId[b.id] ?? 0) - (viewCountByContractId[a.id] ?? 0)
  )

  return {
    topByTraders: topByTradersRows.map((row) => ({
      contract: convertContract(row),
      tradersYesterday: row.traders_yesterday,
    })),
    topByViews: topByViewsContracts.map((contract) => ({
      contract,
      viewsYesterday: viewCountByContractId[contract.id] ?? 0,
    })),
  }
}
