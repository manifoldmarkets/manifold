import {
  FOR_YOU_MIN_MARKET_VIEWS,
  hasEnoughBrowseHistory,
} from 'common/browse-personalization'
import { SupabaseDirectClient } from 'shared/supabase/init'

export const BROWSE_PERSONALIZATION_SQL = `
  with latest_profile as (
    select group_ids_to_activity
    from user_topic_interests
    where user_id = $1
    order by created_time desc
    limit 1
  ), opened_markets as (
    select 1
    from user_contract_views v
    join contracts c on c.id = v.contract_id
    where v.user_id = $1
      and v.page_views > 0
      and c.visibility = 'public'
      and c.deleted = false
    limit $2
  )
  select
    (select count(*)::int from opened_markets) as distinct_market_views,
    exists (
      select 1
      from latest_profile,
        jsonb_each(group_ids_to_activity) as topic
      where case when jsonb_typeof(topic.value -> 'conversionScore') = 'number'
        then (topic.value ->> 'conversionScore')::numeric > 0
          and (topic.value ->> 'conversionScore')::numeric <= 1
        else false end
    ) as has_learned_interests
`

export const getBrowsePersonalizationEligibility = (
  pg: SupabaseDirectClient,
  userId: string
) =>
  pg.tx(async (tx) => {
    // This optional default must not leave work running on the database after
    // the browser has fallen back to All.
    await tx.none('set local statement_timeout = 1000')
    const row = await tx.one<{
      distinct_market_views: number
      has_learned_interests: boolean
    }>(BROWSE_PERSONALIZATION_SQL, [userId, FOR_YOU_MIN_MARKET_VIEWS])
    return hasEnoughBrowseHistory(
      row.distinct_market_views,
      row.has_learned_interests
    )
  })
