import { run, selectJson, selectFrom } from 'common/supabase/utils'
import { db } from './db'

export async function getAllAds() {
  const query = selectJson(db, 'posts')
    .eq('data->>type', 'ad')
    .gt('data->>funds', 0)
    .order('data->>createTime', { ascending: false } as any)

  const { data } = await run(query)
  return data.map((r) => r.data)
}

export async function getWatchedAdIds(userId: string) {
  const query = selectFrom(db, 'txns', 'fromId').contains('data', {
    category: 'AD_REDEEM',
    toId: userId,
  })
  const { data } = await run(query)
  return data.map(({ fromId }) => fromId)
}

export async function getSkippedAdIds(userId: string) {
  const query = selectJson(db, 'user_events')
    .eq('user_id', userId)
    .eq('data->>name', 'Skip ad')

  const { data } = await run(query)
  return data.map((r) => (r.data as any).adId)
}

export async function getUsersWhoWatched(adId: string) {
  const query = selectFrom(db, 'txns', 'toId').contains('data', {
    category: 'AD_REDEEM',
    fromId: adId,
  })
  const { data } = await run(query)
  return data.map(({ toId }) => toId) ?? []
}

export async function getUsersWhoSkipped(adId: string) {
  const query = db
    .from('user_events')
    .select('user_id')
    .eq('data->>name', 'Skip ad')
    .eq('data->>adId', adId)

  const { data } = await run(query)
  return data.map((r) => r['user_id']) ?? []
}

export const getBoosts = async (userId: string) => {
  const { data } = await db.rpc('get_top_market_ads', { uid: userId })
  return data
}
