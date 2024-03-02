import { uniq } from 'lodash'
import { db } from './db'
import { run, selectFrom, tsToMillis } from 'common/supabase/utils'
import { filterDefined } from 'common/util/array'
import { getUsers } from './user'

export async function getDonationsByCharity() {
  const { data } = await db.rpc('get_donations_by_charity')
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
  return async (limit: number, after?: { ts: number }) => {
    let q = db
      .from('txns')
      .select('from_id, created_time, amount')
      .eq('category', 'CHARITY')
      .eq('to_id', charityId)
      .order('data->createdTime', { ascending: false } as any)
      .limit(limit)

    if (after?.ts) {
      q = q.lt('data->createdTime', after.ts)
    }
    const txnData = (await run(q)).data
    const userIds = uniq(txnData.map((t) => t.from_id!))
    const users = await getUsers(userIds)
    const usersById = Object.fromEntries(
      filterDefined(users).map((u) => [u.id, u])
    )
    const donations = txnData.map((t) => ({
      user: usersById[t.from_id!],
      ts: tsToMillis(t.created_time!),
      amount: t.amount!,
    }))
    return donations
  }
}

export async function getMostRecentDonation() {
  const { data } = await run(
    selectFrom(db, 'txns', 'fromId', 'toId')
      .eq('category', 'CHARITY')
      .order('data->createdTime', { ascending: false } as any)
      .limit(1)
  )
  return data[0]
}
