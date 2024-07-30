import { chunk, groupBy, mapValues, sortBy } from 'lodash'
import {
  convertSQLtoTS,
  millisToTs,
  Row,
  run,
  SupabaseClient,
  tsToMillis,
} from './utils'
import { Contract } from '../contract'
import { Answer } from 'common/answer'
import { Json } from 'common/supabase/schema'
import { removeUndefinedProps } from 'common/util/object'

export const CONTRACTS_PER_SEARCH_PAGE = 40

export const getContractFromSlug = async (
  db: SupabaseClient,
  contractSlug: string
) => getContract(db, contractSlug, 'slug')

export const getContract = async (
  db: SupabaseClient,
  id: string,
  pk: 'id' | 'slug' = 'id'
) => {
  const { data } = await db.from('contracts').select(contractFields).eq(pk, id)
  return data && data.length ? convertContract(data[0]) : null
}

export const getContracts = async (
  db: SupabaseClient,
  ids: string[],
  pk: 'id' | 'slug' = 'id',
  publicOnly = false
) => {
  if (ids.length === 0) {
    return [] as Contract[]
  }
  const chunks = chunk(ids, 300)
  const promises = chunks.map((chunk) => {
    const q = db.from('contracts').select(contractFields).in(pk, chunk)
    if (publicOnly) {
      q.eq('visibility', 'public')
    }

    return run(q)
  })
  const results = await Promise.all(promises)
  return results.flatMap((result) => result.data.map((r) => convertContract(r)))
}

export const contractFields =
  'data, importance_score, view_count, conversion_score, freshness_score, daily_score'

export const getUnresolvedContractsCount = async (
  creatorId: string,
  db: SupabaseClient
) => {
  const { count } = await run(
    db
      .from('contracts')
      .select('*', { head: true, count: 'exact' })
      .eq('creator_id', creatorId)
      .is('resolution_time', null)
      .lt('close_time', millisToTs(Date.now()))
      .neq('outcome_type', 'BOUNTIED_QUESTION')
  )
  return count
}

export const getRecentContractIds = async (
  creatorId: string,
  startDate: number,
  db: SupabaseClient
) => {
  const { data } = await run(
    db
      .from('contracts')
      .select('id')
      .eq('creator_id', creatorId)
      .gte('created_time', millisToTs(startDate))
  )
  return data.map((d) => d.id as string)
}

export const getContractsByUsers = async (
  userIds: string[],
  db: SupabaseClient,
  createdTime?: number
) => {
  if (userIds.length === 0) {
    return null
  }
  const chunks = chunk(userIds, 300)
  const promises = chunks.map(async (chunk) => {
    const { data } = await run(
      db.rpc('get_contracts_by_creator_ids', {
        creator_ids: chunk,
        created_time: createdTime ?? 0,
      })
    )
    return data
  })
  try {
    const usersToContracts = {} as { [userId: string]: Contract[] }
    const results = (await Promise.all(promises)).flat().flat()
    results.forEach((r) => {
      usersToContracts[r.creator_id] = r.contracts as Contract[]
    })
    return usersToContracts
  } catch (e) {
    console.log(e)
  }
  return null
}

export const getAnswersForContracts = async (
  db: SupabaseClient,
  contractIds: string[]
) => {
  const { data } = await db
    .from('answers')
    .select('*')
    .in('contract_id', contractIds)
    .order('index', { ascending: true })
  if (!data) return {}
  const answers = data.map(convertAnswer)
  return mapValues(groupBy(answers, 'contractId'), (a) => sortBy(a, 'index'))
}

export const convertAnswer = (row: Row<'answers'>) =>
  convertSQLtoTS<'answers', Answer>(row, {
    created_time: (maybeTs) => (maybeTs != null ? tsToMillis(maybeTs) : 0),
  })
export const convertContract = (c: {
  data: Json
  importance_score: number | null
  view_count?: number | null
  conversion_score?: number | null
  freshness_score?: number | null
  daily_score?: number | null
}) =>
  removeUndefinedProps({
    ...(c.data as Contract),
    // Only updated in supabase:
    importanceScore: c.importance_score,
    conversionScore: c.conversion_score,
    freshnessScore: c.freshness_score,
    viewCount: Number(c.view_count),
    dailyScore: c.daily_score,
  } as Contract)

export const followContract = async (
  db: SupabaseClient,
  contractId: string,
  userId: string
) => {
  return db.from('contract_follows').upsert({
    contract_id: contractId,
    follow_id: userId,
  })
}

export const unfollowContract = async (
  db: SupabaseClient,
  contractId: string,
  userId: string
) => {
  return db
    .from('contract_follows')
    .delete()
    .eq('contract_id', contractId)
    .eq('follow_id', userId)
}
