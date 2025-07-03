import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { sumBy } from 'lodash'
import {
  from,
  select,
  where,
  renderSql,
  join,
} from 'shared/supabase/sql-builder'

export const getBoostAnalytics: APIHandler<'get-boost-analytics'> = async (
  body
) => {
  const { contractId } = body
  const pg = createSupabaseDirectClient()

  const adQuery = renderSql(
    select('cb.*, u.name as creator_name, u.username as creator_username'),
    from('contract_boosts cb'),
    join('users u on cb.user_id = u.id'),
    where('cb.contract_id = ${contractId}', { contractId })
  )

  const viewQuery = renderSql(
    from('user_contract_views'),
    select('user_id, promoted_views, card_views, page_views'),
    where('contract_id = ${contractId}', { contractId }),
    where('promoted_views > 0 or card_views > 0 or page_views > 0')
  )

  const results = await pg.multi(`${adQuery}; ${viewQuery};`)
  const adData = results[0]
  const viewData = results[1]

  const promotedViewData = viewData?.filter((v) => v.promoted_views > 0)
  return {
    uniquePromotedViewers: promotedViewData.length,
    totalPromotedViews: sumBy(promotedViewData, (d) => d.promoted_views),
    uniqueViewers: viewData.length,
    totalViews: sumBy(
      viewData,
      (d) => d.promoted_views + d.card_views + d.page_views
    ),
    boostPeriods: adData.map((ad) => ({
      startTime: ad.start_time,
      endTime: ad.end_time,
      creatorName: ad.creator_name,
      creatorUsername: ad.creator_username,
    })),
  }
}
