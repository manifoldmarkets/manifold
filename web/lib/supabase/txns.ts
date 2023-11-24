import { db } from './db'
import { run, selectFrom } from 'common/supabase/utils'

export async function getDonationsByCharity() {
  const { data } = await db.rpc('get_donations_by_charity')
  return Object.fromEntries(
    (data ?? []).map((r) => [r.charity_id, r.total])
  )
}

export async function getAllDonations(charityId: string) {
  const { data } = await run(
    selectFrom(db, 'txns', 'fromId', 'createdTime', 'amount')
      .eq('data->>category', 'CHARITY')
      .eq('data->>toId', charityId)
      .order('data->createdTime', { ascending: false } as any)
  )
  return data
}

export async function getMostRecentDonation() {
  const { data } = await run(
    selectFrom(db, 'txns', 'fromId', 'toId')
      .eq('data->>category', 'CHARITY')
      .order('data->createdTime', { ascending: false } as any)
      .limit(1)
  )
  return data[0]
}
