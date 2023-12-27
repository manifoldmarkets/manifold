import { Contract, CPMMContract, Visibility } from 'common/contract'
import { run, selectFrom, SupabaseClient, Tables } from 'common/supabase/utils'
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
        db.from('public_contracts').select('data').in('id', ids)
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
  const q = db.from('contracts').select('data').in(pk, contractIds)
  const { data } = await run(q)
  return data.map((d) => d.data as Contract)
}

export const getContract = async (id: string) => {
  const { data } = await run(db.from('contracts').select('data').eq('id', id))
  return data && data.length > 0 ? (data[0].data as Contract) : null
}

export const getContractWithFields = async (id: string) => {
  const { data } = await run(db.from('contracts').select('*').eq('id', id))
  if (data && data.length > 0) {
    const result = data[0]
    return {
      ...(result.data as Contract),
      visibility: result.visibility,
      slug: result.slug,
    }
  } else {
    return null
  }
}

// Only fetches contracts with 'public' visibility
export const getRecentPublicContractRows = async (options: {
  limit: number
}) => {
  const q = db
    .from('public_contracts')
    .select('*')
    .order('created_time', { ascending: false })
    .limit(options.limit)
  const { data } = await run(q)
  return data as Tables['contracts']['Row'][]
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

  const contracts = filterDefined(data.map((d) => d.data as CPMMContract))
  return contracts
}

export async function getContractFromSlug(
  contractSlug: string,
  db: SupabaseClient
) {
  const { data: contract } = await run(
    db.from('contracts').select('data').eq('slug', contractSlug)
  )
  if (contract && contract.length > 0) {
    return (contract[0] as unknown as { data: Contract }).data
  }
  return undefined
}

export async function getContractVisibilityFromSlug(contractSlug: string) {
  const { data: contractVisibility } = await run(
    db.from('contracts').select('visibility').eq('slug', contractSlug)
  )

  if (contractVisibility && contractVisibility.length > 0) {
    return (contractVisibility[0] as unknown as { visibility: Visibility })
      .visibility
  }
  return undefined
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
          .order('data->>createdTime' as any, { ascending: false })
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

export async function getIsPrivateContractMember(
  userId: string,
  contractId: string
) {
  const { data } = await db.rpc('is_private_contract_member', {
    this_contract_id: contractId,
    this_member_id: userId,
  })
  return data
}

export const getTrendingContracts = async (limit: number) => {
  return await db
    .from('contracts')
    .select('data, importance_score')
    .is('resolution_time', null)
    .order('importance_score', { ascending: false })
    .limit(limit)
    .then((res) => res.data?.map((c) => convertContract(c)))
}
