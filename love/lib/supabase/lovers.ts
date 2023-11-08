import { sortBy } from 'lodash'
import { run } from 'common/supabase/utils'
import { CPMMMultiContract } from 'common/contract'
import { db } from 'web/lib/supabase/db'
import { getSixMonthProb } from '../util/relationship-market'

export const getLoverRow = async (userId: string) => {
  const res = await run(db.from('lovers').select('*').eq('user_id', userId))
  return res.data[0]
}

export const getMatches = async (userId: string) => {
  const res = await run(
    db
      .from('contracts')
      .select('*')
      .filter('outcome_type', 'eq', 'MULTIPLE_CHOICE')
      .filter('resolution', 'is', null)
      .neq('data->>loverUserId1', null)
      .neq('data->>loverUserId2', null)
      .or(`data->>loverUserId1.eq.${userId},data->>loverUserId2.eq.${userId}`)
  )
  const contracts = res.data.map((r) => r.data) as CPMMMultiContract[]
  console.log('contract', contracts[0])

  return sortBy(contracts, (c) => getSixMonthProb(c)).reverse()
}

export const deleteLover = async (userId: string) => {
  await run(db.from('lovers').delete().filter('user_id', 'eq', userId))
}
