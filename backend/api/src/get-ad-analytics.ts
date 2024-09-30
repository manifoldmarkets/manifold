import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { sumBy } from 'lodash'
import { log } from 'shared/utils'
import { from, select, where, renderSql } from 'shared/supabase/sql-builder'

export const getadanalytics: APIHandler<'get-ad-analytics'> = async (body) => {
  const { contractId } = body
  const pg = createSupabaseDirectClient()

  const adQuery = renderSql(
    from('market_ads'),
    select('id, funds, created_at, cost_per_view'),
    where('market_id = ${contractId}', { contractId })
  )

  const viewQuery = renderSql(
    from('user_contract_views'),
    select('user_id, promoted_views, card_views'),
    where('contract_id = ${contractId}', { contractId }),
    where('promoted_views > 0 or card_views > 0')
  )

  const [adData, viewData] = await Promise.all([
    pg.any(adQuery),
    pg.any(viewQuery),
  ])

  log({ adData, viewData })

  const lastAdData = adData?.[0]

  const redeemQuery = renderSql(
    from('txns'),
    select('count(*)'),
    where(`category = 'MARKET_BOOST_REDEEM'`),
    where('from_id = ${fromId}', { fromId: lastAdData?.id })
  )
  const redeemCount = lastAdData ? (await pg.one(redeemQuery)).count : 0

  const promotedViewData = viewData?.filter((v) => v.promoted_views > 0)
  const totalFunds = adData?.reduce((acc, v) => acc + v.funds, 0) ?? 0
  return {
    uniquePromotedViewers: promotedViewData.length,
    totalPromotedViews: sumBy(promotedViewData, (d) => d.promoted_views),
    uniqueViewers: viewData.length,
    totalViews: sumBy(viewData, (d) => d.promoted_views + d.card_views),
    redeemCount,
    isBoosted: !!adData?.length,
    totalFunds,
    adCreatedTime: lastAdData?.created_at,
  }
}
