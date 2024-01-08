import { chunk, groupBy } from 'lodash'
import {
  convertSQLtoTS,
  millisToTs,
  Row,
  run,
  selectJson,
  SupabaseClient,
  tsToMillis,
} from './utils'
import { Contract } from '../contract'
import { Answer } from 'common/answer'
import { Json } from 'common/supabase/schema'

export const CONTRACTS_PER_SEARCH_PAGE = 40
export const getContractFromSlug = async (
  contractSlug: string,
  db: SupabaseClient
) => {
  const { data } = await run(
    db.from('contracts').select('data').eq('slug', contractSlug)
  )
  if (data.length === 0) return null
  return data[0].data as Contract
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
    run(selectJson(db, 'contracts').in('id', chunk))
  )
  const results = await Promise.all(promises)
  return results.flatMap((result) => result.data.map((r) => r.data))
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
    .order('index', { ascending: false })
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
}) =>
  ({
    ...(c.data as Contract),
    // importance_score is only updated in Supabase
    importanceScore: c.importance_score,
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
