import { getApiUrl } from 'common/api/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { LOCAL_DEV } from 'shared/utils'

export const deliverPerpOrderEffects = async () => {
  if (LOCAL_DEV || !process.env.API_SECRET) return
  const pg = createSupabaseDirectClient()
  const rows = await pg.manyOrNone<{ id: string }>(
    "select id from perp_orders where status='filled' and participation_applied_at is null order by completed_time,id limit 25"
  )
  if (!rows.length) return
  const response = await fetch(getApiUrl('internal-perp-order-effects'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiSecret: process.env.API_SECRET,
      orderIds: rows.map((o) => o.id),
    }),
    signal: AbortSignal.timeout(10_000),
  })
  await response.text()
  if (!response.ok)
    throw new Error(
      'Perp order participation delivery failed: ' + response.status
    )
}
