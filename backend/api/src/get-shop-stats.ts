import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
dayjs.extend(utc)
dayjs.extend(timezone)

// Supporter tier item IDs
const SUBSCRIPTION_ITEM_IDS = [
  'supporter-basic',
  'supporter-plus',
  'supporter-premium',
]

export type ShopStats = {
  // Daily subscription sales (supporter tiers)
  subscriptionSales: {
    date: string
    itemId: string
    quantity: number
    revenue: number
  }[]
  // Daily digital goods sales (non-subscription items)
  digitalGoodsSales: {
    date: string
    itemId: string
    quantity: number
    revenue: number
  }[]
  // Current active subscriber counts by tier
  subscribersByTier: {
    tier: 'basic' | 'plus' | 'premium'
    count: number
    autoRenewCount: number
  }[]
  // Daily subscription counts over time
  subscriptionsOverTime: {
    date: string
    basicCount: number
    plusCount: number
    premiumCount: number
    totalCount: number
  }[]
}

// Note: The subscriptionsOverTime query does a CROSS JOIN between days and entitlements.
// If subscriptions grow significantly, consider:
// 1. Adding index: user_entitlements(entitlement_id, enabled, granted_time, expires_time)
// 2. Rewriting to calculate daily deltas instead of re-computing counts per day
// 3. Pre-computing stats in a scheduled job (like daily_stats)
// Currently protected by 1-hour ISR cache from getStaticProps in stats.tsx.
export const getShopStats: APIHandler<'get-shop-stats'> = async (props) => {
  const { limitDays } = props
  const pg = createSupabaseDirectClient()

  const start = dayjs()
    .tz('America/Los_Angeles')
    .subtract(limitDays, 'day')
    .startOf('day')
    .toISOString()

  // Get daily subscription sales (supporter tiers only)
  const subscriptionSales = await pg.manyOrNone<{
    date: string
    itemId: string
    quantity: number
    revenue: number
  }>(
    `
    select 
      date_trunc('day', created_time at time zone 'America/Los_Angeles')::date::text as date,
      item_id as "itemId",
      sum(quantity)::int as quantity,
      sum(price_mana)::bigint as revenue
    from shop_orders
    where created_time >= $1
      and status = 'COMPLETED'
      and item_id = any($2)
    group by date, item_id
    order by date, item_id
    `,
    [start, SUBSCRIPTION_ITEM_IDS]
  )

  // Get daily digital goods sales (non-subscription items)
  const digitalGoodsSales = await pg.manyOrNone<{
    date: string
    itemId: string
    quantity: number
    revenue: number
  }>(
    `
    select 
      date_trunc('day', created_time at time zone 'America/Los_Angeles')::date::text as date,
      item_id as "itemId",
      sum(quantity)::int as quantity,
      sum(price_mana)::bigint as revenue
    from shop_orders
    where created_time >= $1
      and status = 'COMPLETED'
      and item_id != all($2)
    group by date, item_id
    order by date, item_id
    `,
    [start, SUBSCRIPTION_ITEM_IDS]
  )

  // Get current active subscriber counts by tier
  const subscribersByTier = await pg.manyOrNone<{
    tier: 'basic' | 'plus' | 'premium'
    count: number
    autoRenewCount: number
  }>(
    `
    select 
      case 
        when entitlement_id = 'supporter-basic' then 'basic'
        when entitlement_id = 'supporter-plus' then 'plus'
        when entitlement_id = 'supporter-premium' then 'premium'
      end as tier,
      count(*)::int as count,
      count(*) filter (where auto_renew = true)::int as "autoRenewCount"
    from user_entitlements
    where entitlement_id in ('supporter-basic', 'supporter-plus', 'supporter-premium')
      and enabled = true
      and (expires_time is null or expires_time > now())
    group by entitlement_id
    order by entitlement_id
    `
  )

  // Get subscription counts over time (new subscriptions per day)
  // This counts active subscriptions at the end of each day
  const subscriptionsOverTime = await pg.manyOrNone<{
    date: string
    basicCount: number
    plusCount: number
    premiumCount: number
    totalCount: number
  }>(
    `
    with date_series as (
      select generate_series(
        ($1::timestamp at time zone 'America/Los_Angeles')::date,
        (now() at time zone 'America/Los_Angeles')::date,
        interval '1 day'
      )::date as dt
    ),
    daily_counts as (
      select 
        ds.dt,
        count(*) filter (
          where ue.entitlement_id = 'supporter-basic' 
            and ue.granted_time <= ds.dt + interval '1 day'
            and (ue.expires_time is null or ue.expires_time > ds.dt)
        )::int as basic_count,
        count(*) filter (
          where ue.entitlement_id = 'supporter-plus'
            and ue.granted_time <= ds.dt + interval '1 day'
            and (ue.expires_time is null or ue.expires_time > ds.dt)
        )::int as plus_count,
        count(*) filter (
          where ue.entitlement_id = 'supporter-premium'
            and ue.granted_time <= ds.dt + interval '1 day'
            and (ue.expires_time is null or ue.expires_time > ds.dt)
        )::int as premium_count
      from date_series ds
      cross join user_entitlements ue
      where ue.entitlement_id in ('supporter-basic', 'supporter-plus', 'supporter-premium')
        and ue.enabled = true
      group by ds.dt
    )
    select 
      dt::text as date,
      coalesce(basic_count, 0) as "basicCount",
      coalesce(plus_count, 0) as "plusCount",
      coalesce(premium_count, 0) as "premiumCount",
      coalesce(basic_count + plus_count + premium_count, 0) as "totalCount"
    from daily_counts
    order by dt
    `,
    [start]
  )

  return {
    subscriptionSales: subscriptionSales ?? [],
    digitalGoodsSales: digitalGoodsSales ?? [],
    subscribersByTier: subscribersByTier ?? [],
    subscriptionsOverTime: subscriptionsOverTime ?? [],
  }
}
