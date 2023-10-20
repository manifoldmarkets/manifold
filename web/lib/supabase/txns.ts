import { db } from './db'
import { run, selectFrom } from 'common/supabase/utils'
import { mapValues, groupBy, sumBy, sortBy, uniq } from 'lodash'

export async function getCharityStats() {
  const { data } = await run(
    selectFrom(db, 'txns', 'fromId', 'toId', 'amount')
      .eq('data->>toType', 'CHARITY')
      .order('data->createdTime', { ascending: false } as any)
  )
  const donorIds = uniq(data.map(t => t.fromId));
  const totalRaised = sumBy(data, t => t.amount);
  const txnsByCharity = groupBy(data, 'toId');
  const totalsByCharity = mapValues(txnsByCharity, (ts) => sumBy(ts, (t) => t.amount))
  const sortedCharities = sortBy(Object.keys(totalsByCharity), [(id) => -totalsByCharity[id]])
  return {
    totalRaised,
    sortedCharities,
    numDonors: donorIds.length,
    mostRecentDonorId: data[0]?.fromId,
    mostRecentCharityId: data[0]?.toId
  }
}
