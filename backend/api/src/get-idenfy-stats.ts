import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
dayjs.extend(utc)
dayjs.extend(timezone)

export type IdenfyStats = {
  dailyStats: {
    date: string
    approvals: number
    denials: number
    pending: number
    suspected: number
  }[]
}

export const getIdenfyStats: APIHandler<'get-idenfy-stats'> = async (props) => {
  const { limitDays } = props
  const pg = createSupabaseDirectClient()

  const start = dayjs()
    .tz('America/Los_Angeles')
    .subtract(limitDays, 'day')
    .startOf('day')
    .toISOString()

  // Get daily verification stats grouped by date and status
  const dailyStats = await pg.manyOrNone<{
    date: string
    approvals: number
    denials: number
    pending: number
    suspected: number
  }>(
    `
    select 
      date_trunc('day', updated_time at time zone 'America/Los_Angeles')::date::text as date,
      count(*) filter (where status = 'approved')::int as approvals,
      count(*) filter (where status = 'denied')::int as denials,
      count(*) filter (where status = 'pending')::int as pending,
      count(*) filter (where status = 'suspected')::int as suspected
    from idenfy_verifications
    where updated_time >= $1
    group by date
    order by date
    `,
    [start]
  )

  return {
    dailyStats: dailyStats ?? [],
  }
}
