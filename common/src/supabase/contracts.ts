import { chunk, groupBy } from 'lodash'
import { run, millisToTs, selectJson, SupabaseClient } from './utils'
import { Contract } from '../contract'
import { Answer } from 'common/answer'
import { removeUndefinedProps } from 'common/util/object'

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
  )
  return count
}

export const getRecentContractsCount = async (
  creatorId: string,
  startDate: number,
  db: SupabaseClient
) => {
  const { count } = await run(
    db
      .from('contracts')
      .select('*', { head: true, count: 'exact' })
      .eq('creator_id', creatorId)
      .gte('created_time', millisToTs(startDate))
  )
  return count
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
  const answers = data.map(parseDbAnswer)
  return groupBy(answers, 'contractId')
}

const parseDbAnswer = (row: any) => {
  const answer: Answer = removeUndefinedProps({
    id: row.id,
    index: row.index ?? undefined,
    contractId: row.contract_id,
    userId: row.user_id,
    text: row.text,
    createdTime: new Date(row.created_time).getTime(),

    poolNo: +row.pool_no,
    poolYes: +row.pool_yes,
    prob: +row.prob,
  })
  return answer
}
