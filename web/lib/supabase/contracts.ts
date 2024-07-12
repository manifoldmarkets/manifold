import { Contract, CPMMContract } from 'common/contract'
import { run, selectFrom, SupabaseClient } from 'common/supabase/utils'
import { filterDefined } from 'common/util/array'
import { db } from './db'
import { chunk, uniqBy } from 'lodash'
import { convertContract } from 'common/supabase/contracts'

// A function to retrieve all contracts a user has bet on.
export async function getUserBetContracts(
  userId: string,
  limit?: number
): Promise<any[]> {
  const { data } = await run(
    db.rpc('get_user_bet_contracts', {
      this_user_id: userId,
      this_limit: limit ?? 1000,
    })
  )
  if (data && data.length > 0) {
    return data.map((d) => (d as any).data as Contract)
  } else {
    return []
  }
}

export async function getPublicContractsByIds(contractIds: string[]) {
  const contractLists = await Promise.all(
    chunk(contractIds, 100).map(async (ids) => {
      const { data } = await run(
        db
          .from('contracts')
          .select('data')
          .eq('visibility', 'public')
          .in('id', ids)
      )
      if (data && data.length > 0) {
        return data.map((d) => d.data as Contract)
      } else {
        return []
      }
    })
  )
  return uniqBy(contractLists.flat(), 'id')
}
export async function getPublicContractIdsInTopics(
  contractIds: string[],
  topicSlugs: string[],
  ignoreSlugs?: string[]
) {
  const contractLists = await Promise.all(
    chunk(contractIds, 100).map(async (ids) => {
      const { data } = await run(
        db.rpc('get_contracts_in_group_slugs_1', {
          contract_ids: ids,
          p_group_slugs: topicSlugs,
          ignore_slugs: ignoreSlugs ?? [],
        })
      )
      if (data && data.length > 0) {
        return data.flat().map((d) => convertContract(d))
      } else {
        return []
      }
    })
  )
  return uniqBy(contractLists.flat(), 'id')
}

export async function getRecentActiveContractsOnTopics(
  topicSlugs: string[],
  ignoreSlugs: string[],
  limit: number
) {
  const { data } = await run(
    db.rpc('get_recently_active_contracts_in_group_slugs_1', {
      p_group_slugs: topicSlugs,
      ignore_slugs: ignoreSlugs,
      max: limit,
    })
  )
  if (data && data.length > 0) {
    return data.flat().map((d) => convertContract(d))
  } else {
    return []
  }
}

export async function getContracts(
  contractIds: string[],
  pk: 'id' | 'slug' = 'id'
) {
  const q = db
    .from('contracts')
    .select('data, importance_score, view_count, conversion_score')
    .in(pk, contractIds)
  const { data } = await run(q)
  return data.map((d) => convertContract(d))
}

export const getContract = async (id: string) => {
  const { data } = await run(
    db
      .from('contracts')
      .select('data, importance_score, view_count, conversion_score')
      .eq('id', id)
  )
  return data?.[0] ? convertContract(data?.[0]) : null
}

export const getContractWithFields = async (id: string) => {
  const { data } = await run(db.from('contracts').select('*').eq('id', id))
  return data?.[0] ? convertContract(data?.[0]) : null
}

export const getRecentPublicContractRows = async (options: {
  limit: number
}) => {
  const q = db
    .from('contracts')
    .select('*')
    .eq('visibility', 'public')
    .order('created_time', { ascending: false })
    .limit(options.limit)
  const { data } = await run(q)
  return data
}

export async function getYourDailyChangedContracts(
  db: SupabaseClient,
  userId: string,
  count: number
) {
  const { data } = await db.rpc('get_your_daily_changed_contracts', {
    uid: userId,
    n: count,
    start: 0,
  })

  if (!data) return null

  return filterDefined(data.map((d) => d.data as CPMMContract))
}

export async function getWatchedContracts(userId: string) {
  const { data: ids } = await run(
    db.from('contract_follows').select('contract_id').eq('follow_id', userId)
  )
  const chunks = chunk(
    ids.map((r) => r.contract_id),
    200
  )
  const datas = await Promise.all(
    chunks.map(async (ids) => {
      const { data } = await run(
        selectFrom(db, 'contracts', 'id', 'question', 'slug', 'creatorUsername')
          .in('id', ids)
          .order('created_time' as any, { ascending: false })
      )
      return data
    })
  )
  return datas.flat()
}

export async function getWatchedContractsCount(userId: string) {
  const { count } = await run(
    db
      .from('contract_follows')
      .select('*', { head: true, count: 'exact' })
      .eq('follow_id', userId)
  )
  return count
}
