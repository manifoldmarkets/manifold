import { chunk, groupBy } from 'lodash'
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
  contractSlug: string,
  db: SupabaseClient
) => {
  const { data } = await run(
    db
      .from('contracts')
      .select('data, importance_score, view_count, conversion_score')
      .eq('slug', contractSlug)
  )
  return data?.[0] ? convertContract(data?.[0]) : null
}

export const getContracts = async (
  contractIds: string[],
  db: SupabaseClient
) => {
  if (contractIds.length === 0) {
    return [] as Contract[]
  }
  const chunks = chunk(contractIds, 300)
  const promises = chunks.map((chunk) =>
    run(
      db
        .from('contracts')
        .select('data, importance_score, view_count, conversion_score')
        .in('id', chunk)
    )
  )
  const results = await Promise.all(promises)
  return results.flatMap((result) => result.data.map((r) => convertContract(r)))
}

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
  return groupBy(answers, 'contractId')
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
}) =>
  removeUndefinedProps({
    ...(c.data as Contract),
    // Only updated in supabase:
    importanceScore: c.importance_score,
    conversionScore: c.conversion_score,
    freshnessScore: c.freshness_score,
    viewCount: Number(c.view_count),
  } as Contract)

export const followContract = async (
  db: SupabaseClient,
  contractId: string,
  userId: string
) => {
  return db.from('contract_follows').upsert({
    contract_id: contractId,
    follow_id: userId,
    data: {
      createdTime: Date.now(),
      id: userId,
    },
    fs_updated_time: new Date().toISOString(),
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
