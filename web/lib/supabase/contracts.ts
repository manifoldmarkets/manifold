import { CPMMContract, Contract, Visibility } from 'common/contract'
import {
  SupabaseClient,
  millisToTs,
  run,
  selectJson,
  selectFrom,
  Tables,
} from 'common/supabase/utils'
import { filterDefined } from 'common/util/array'
import { ContractTypeType, Sort, filter } from 'web/components/supabase-search'
import { stateType } from 'web/components/supabase-search'
import { supabaseSearchContracts } from '../firebase/api'
import { db } from './db'
import { chunk, flatten, keyBy } from 'lodash'

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

export async function getPublicContractIds(contractIds: string[]) {
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
  const contractsById = keyBy(flatten(contractLists), 'id')
  return filterDefined(contractIds.map((id) => contractsById[id]))
}

export async function getContracts(
  contractIds: string[],
  pk: 'id' | 'slug' = 'id'
) {
  const { data } = await run(
    db.from('contracts').select('data').in(pk, contractIds)
  )
  if (data && data.length > 0) {
    return data.map((d) => d.data as Contract)
  } else {
    return []
  }
}

export const getPublicContract = async (id: string) => {
  const { data } = await run(
    db.from('public_contracts').select('data').eq('id', id)
  )
  return data && data.length > 0 ? (data[0].data as Contract) : null
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
export const getPublicContractRows = async (options: {
  limit: number
  beforeTime?: number
  order?: 'asc' | 'desc'
}) => {
  let q = db.from('public_contracts').select('*')
  q = q.order('created_time', {
    ascending: options?.order === 'asc',
  } as any)
  if (options.beforeTime) {
    q = q.lt('created_time', millisToTs(options.beforeTime))
  }
  q = q.limit(options.limit)
  const { data } = await run(q)
  return data as Tables['contracts']['Row'][]
}

// Only fetches contracts with 'public' visibility
export const getPublicContracts = async (options: {
  limit: number
  beforeTime?: number
  order?: 'asc' | 'desc'
}) => {
  let q = selectJson(db, 'public_contracts')
  q = q.order('created_time', {
    ascending: options?.order === 'asc',
  } as any)
  if (options.beforeTime) {
    q = q.lt('created_time', millisToTs(options.beforeTime))
  }
  q = q.limit(options.limit)
  const { data } = await run(q)
  return data.map((r) => r.data)
}

export async function getYourRecentContracts(
  db: SupabaseClient,
  userId: string,
  count: number
) {
  const { data } = await db.rpc('get_your_recent_contracts', {
    uid: userId,
    n: count,
    start: 0,
  })

  if (!data) return null

  const contracts = filterDefined(data.map((d) => (d as any).data))
  return contracts
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

  const contracts = filterDefined(
    data.map((d) => (d as any).data)
  ) as CPMMContract[]
  return contracts
}

export async function getYourTrendingContracts(
  db: SupabaseClient,
  userId: string,
  count: number
) {
  const { data } = await db.rpc('get_your_trending_contracts', {
    uid: userId,
    n: count,
    start: 0,
  })

  return data?.map((d) => (d as any).data as Contract)
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

export async function searchContract(props: {
  state?: stateType
  query: string
  filter: filter
  sort: Sort
  contractType?: ContractTypeType
  offset?: number
  topic?: string
  limit: number
  group_id?: string
  creator_id?: string
}) {
  const {
    query,
    topic,
    filter,
    sort,
    contractType = 'ALL',
    offset = 0,
    limit,
    group_id,
    creator_id,
  } = props

  const state = props.state ?? {
    contracts: undefined,
    fuzzyContractOffset: 0,
    shouldLoadMore: false,
    showTime: null,
  }

  if (limit === 0) {
    return { fuzzyOffset: 0, data: [] }
  }

  if (!query) {
    const contracts = await supabaseSearchContracts({
      term: '',
      filter,
      sort,
      contractType,
      offset,
      limit,
      topic,
      groupId: group_id,
      creatorId: creator_id,
    })
    if (contracts) {
      return { fuzzyOffset: 0, data: contracts }
    }
  }
  if (state.fuzzyContractOffset > 0) {
    const contractFuzzy = searchContractFuzzy({
      state,
      query,
      filter,
      sort,
      contractType,
      limit,
      group_id,
      creator_id,
      topic,
    })
    return contractFuzzy
  }

  const contracts = await supabaseSearchContracts({
    term: query,
    filter,
    sort,
    contractType,
    offset,
    limit,
    fuzzy: false,
    groupId: group_id,
    creatorId: creator_id,
    topic,
  })
  if (contracts) {
    if (contracts.length == limit) {
      return { fuzzyOffset: 0, data: contracts }
    } else {
      const fuzzyData = await searchContractFuzzy({
        state,
        query,
        filter,
        sort,
        contractType,
        limit: limit - contracts.length,
        group_id,
        creator_id,
      })
      return {
        fuzzyOffset: fuzzyData.fuzzyOffset,
        data: contracts.concat(fuzzyData.data),
      }
    }
  }
  return { fuzzyOffset: 0, data: [] }
}

export async function searchContractFuzzy(props: {
  state: stateType
  query: string
  filter: filter
  sort: Sort
  contractType: ContractTypeType
  topic?: string
  limit: number
  group_id?: string
  creator_id?: string
}) {
  const {
    state,
    topic,
    query,
    filter,
    sort,
    contractType,
    limit,
    group_id,
    creator_id,
  } = props
  const contracts = await supabaseSearchContracts({
    term: query,
    filter,
    sort,
    contractType,
    offset: state.fuzzyContractOffset,
    limit,
    fuzzy: true,
    groupId: group_id,
    creatorId: creator_id,
    topic,
  })
  if (contracts) {
    return {
      fuzzyOffset: contracts.length,
      data: contracts,
    }
  }
  return { fuzzyOffset: 0, data: [] }
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
  return data as boolean | null
}
