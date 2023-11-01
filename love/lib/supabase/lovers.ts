import { sortBy } from 'lodash'
import { run } from 'common/supabase/utils'
import { BinaryContract } from 'common/contract'
import { db } from 'web/lib/supabase/db'
import { getProbability } from 'common/calculate'

export const getLoverRow = async (userId: string) => {
  const res = await run(db.from('lovers').select('*').eq('user_id', userId))
  return res.data[0]
}

export const getMatches = async (userId: string) => {
  const res = await run(
    db
      .from('contracts')
      .select('*')
      .neq('data->>loverUserId1', null)
      .neq('data->>loverUserId2', null)
      .or(`data->>loverUserId1.eq.${userId},data->>loverUserId2.eq.${userId}`)
  )
  const contracts = res.data.map((r) => r.data) as BinaryContract[]

  return sortBy(contracts, (c) => getProbability(c)).reverse()
}
