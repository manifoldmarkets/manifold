import { db } from './db'
import { run, selectFrom } from 'common/supabase/utils'

export async function getDonationsByCharity() {
  const { data, error } = await db.rpc('get_donations_by_charity')
  return Object.fromEntries(
    (data ?? []).map((r) => [
      r.charity_id,
      {
        total: r.total,
        numSupporters: r.num_supporters,
      },
    ])
  )
}

export function getDonationsPageQuery(charityId: string) {
  return async (
    limit: number,
    after?: { userId: string; ts: number; amount: number }
  ) => {
    let q = selectFrom(db, 'txns', 'fromId', 'createdTime', 'amount')
      .eq('data->>category', 'CHARITY')
      .eq('data->>toId', charityId)
      .order('data->createdTime', { ascending: false } as any)
      .limit(limit)
    if (after?.ts) {
      q = q.lt('data->createdTime', after.ts)
    }
    const txnData = (await run(q)).data

    const donations = txnData.map((t) => ({
      userId: t.fromId,
      ts: t.createdTime,
      amount: t.amount,
    }))
    return donations
  }
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
