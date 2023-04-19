import { CPMMContract, Contract, visibility } from 'common/contract'
import {
  SupabaseClient,
  millisToTs,
  run,
  selectJson,
} from 'common/supabase/utils'
import { filterDefined } from 'common/util/array'
import { Sort, filter } from 'web/components/supabase-search'
import { stateType } from 'web/components/supabase-search'
import { supabaseSearchContracts } from '../firebase/api'
import { db } from './db'

export async function getContractIds(contractIds: string[]) {
  const { data } = await run(
    db.from('contracts').select('data').in('id', contractIds)
  )
  if (data && data.length > 0) {
    return data.map((d) => d.data as Contract)
  } else {
    return []
  }
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
export const getContracts = async (options: {
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
    return (contractVisibility[0] as unknown as { visibility: visibility })
      .visibility
  }
  return undefined
}

export async function searchContract(props: {
  state?: stateType
  query: string
  filter: filter
  sort: Sort
  offset?: number
  limit: number
  group_id?: string
  creator_id?: string
}) {
  const { query, filter, sort, offset = 0, limit, group_id, creator_id } = props
  const state = props.state ?? {
    contracts: undefined,
    fuzzyContractOffset: 0,
    shouldLoadMore: false,
    showTime: null,
  }

  if (limit === 0) {
    return {
      fuzzyOffset: 0,
      data: {},
    }
  }

  if (!query) {
    const contracts = await supabaseSearchContracts({
      term: '',
      filter: filter,
      sort: sort,
      offset: offset,
      limit: limit,
      groupId: group_id,
      creatorId: creator_id,
    })
    if (contracts) {
      return {
        fuzzyOffset: 0,
        data: contracts,
      }
    }
  }
  if (state.fuzzyContractOffset > 0) {
    const contractFuzzy = searchContractFuzzy({
      state,
      query,
      filter,
      sort,
      limit,
      group_id,
      creator_id,
    })
    return contractFuzzy
  }

  const contracts = await supabaseSearchContracts({
    term: query,
    filter: filter,
    sort: sort,
    offset: offset,
    limit: limit,
    fuzzy: false,
    groupId: group_id,
    creatorId: creator_id,
  })
  if (contracts) {
    if (contracts.length == 20) {
      return { fuzzyOffset: 0, data: contracts }
    } else {
      const fuzzyData = await searchContractFuzzy({
        state,
        query,
        filter,
        sort,
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
  limit: number
  group_id?: string
  creator_id?: string
}) {
  const { state, query, filter, sort, limit, group_id, creator_id } = props
  const contracts = await supabaseSearchContracts({
    term: query,
    filter: filter,
    sort: sort,
    offset: state.fuzzyContractOffset,
    limit: limit,
    fuzzy: true,
    groupId: group_id,
    creatorId: creator_id,
  })
  if (contracts) {
    return {
      fuzzyOffset: contracts.length,
      data: contracts,
    }
  }
  return { fuzzyOffset: 0, data: [] }
}
