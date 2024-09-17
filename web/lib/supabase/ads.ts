import { run } from 'common/supabase/utils'
import { db } from './db'

export async function getAdCanPayFunds(adId: string) {
  const query = db
    .from('market_ads')
    .select('funds,cost_per_view')
    .eq('id', adId)
    .limit(1)

  const { data } = await run(query)
  if (data && data.length > 0) {
    const canPay = data[0].funds >= data[0].cost_per_view
    return canPay
  } else {
    return false
  }
}
