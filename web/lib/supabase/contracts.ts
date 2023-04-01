import { CPMMContract, visibility, Contract } from 'common/contract'
import {
  millisToTs,
  run,
  selectJson,
  SupabaseClient,
} from 'common/supabase/utils'
import { filterDefined } from 'common/util/array'
import { adminDb, db } from './db'
import { filter, Sort } from 'web/components/contract-search'

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

export const getContracts = async (options: {
  limit: number
  beforeTime?: number
  order?: 'asc' | 'desc'
}) => {
  let q = selectJson(db, 'contracts')
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
  permission?: 'admin'
) {
  const client = permission == 'admin' ? adminDb : db
  const { data: contract } = await run(
    client.from('contracts').select('data').eq('slug', contractSlug)
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

// export const getContracts = async (options: {
//   limit: number
//   beforeTime?: number
//   order?: 'asc' | 'desc'
// }) => {
//   let q = selectJson(db, 'contracts')
//   q = q.order('created_time', {
//     ascending: options?.order === 'asc',
//   } as any)
//   if (options.beforeTime) {
//     q = q.lt('created_time', millisToTs(options.beforeTime))
//   }
//   q = q.limit(options.limit)
//   const { data } = await run(q)
//   return data.map((r) => r.data)
// }

export async function searchContract(
  query: string,
  filter?: filter,
  sort?: Sort
) {
  let queryBuilder = selectJson(db, 'contracts_rbac').textSearch(
    'question',
    `${query}`
  )

  const handleSort: {
    [key in Sort]: (q: typeof queryBuilder) => any
  } = {
    relevance: (query) => query,
    newest: (query) => query.order('created_time', { ascending: false }),
    score: (query) => query.order('popularity_score', { ascending: false }),
    'daily-score': (query) =>
      query.order('data->dailyScore', { ascending: false }),
    '24-hour-vol': (query) =>
      query.order('data->volume24Hours', { ascending: false }),
    'most-popular': (query) =>
      query.order('data->uniqueBettorCount', { ascending: false }),
    liquidity: (query) => query.order('data->elasticity', { ascending: true }),
    'last-updated': (query) =>
      query.order('data->lastUpdatedTime', { ascending: false }),
    'close-date': (query) =>
      query
        .order('close_time', { ascending: true })
        .gt('close_time', new Date().toISOString()),
    'just-resolved': (query) =>
      query.order('resolution_time', { ascending: false }),
    'prob-descending': (query) =>
      query.order('resolution_probability', { ascending: false }),
    'prob-ascending': (query) =>
      query.order('resolution_probability', { ascending: true }),
  }
  if (sort) {
    const func = handleSort[sort]
    if (func) {
      queryBuilder = func(queryBuilder)
    }
  }

  const { data } = await run(queryBuilder)
  if (data && data.length > 0) {
    return data.map((d) => d.data as Contract)
  } else {
    return []
  }
}
