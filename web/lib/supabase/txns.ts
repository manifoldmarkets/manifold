import { filterDefined } from 'common/util/array'
import { removeUndefinedProps } from 'common/util/object'
import { uniq } from 'lodash'
import { api } from '../api/api'
import { db } from './db'
import { getDisplayUsers } from './users'

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
  return async (p: { limit: number; after?: { ts: number } }) => {
    const txnData = await api(
      'txns',
      removeUndefinedProps({
        category: 'CHARITY',
        toId: charityId,
        before: p.after?.ts, // we're descending. we want txns earlier than the last list item
        limit: p.limit,
      })
    )

    const userIds = uniq(txnData.map((t) => t.fromId!))
    const users = await getDisplayUsers(userIds)
    const usersById = Object.fromEntries(
      filterDefined(users).map((u) => [u.id, u])
    )
    const donations = txnData.map((t) => ({
      user: usersById[t.fromId!],
      ts: t.createdTime,
      amount:
        t.token == 'M$'
          ? t.amount / 100
          : t.token == 'SPICE'
          ? t.amount / 1000
          : t.token == 'CASH'
          ? t.amount
          : 0,
    }))
    return donations
  }
}

export async function getMostRecentDonation() {
  const data = await api('txns', { category: 'CHARITY', limit: 1 })
  return data[0]
}
