import { chunk } from 'lodash'
import { run, millisToTs, selectJson, SupabaseClient } from './utils'
import { Contract } from '../contract'

export const getContractFromSlug = async (
  contractSlug: string,
  db: SupabaseClient
) => {
  const { data } = await run(
    db.from('contracts').select('data').eq('slug', contractSlug).maybeSingle()
  )
  return data ? (data.data as Contract) : null
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
