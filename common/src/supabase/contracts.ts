import { chunk } from 'lodash'
import { run, millisToTs, selectJson, SupabaseClient } from './utils'
import { Contract } from '../contract'

function getContractDb(isAdmin: boolean | undefined) {
  return isAdmin ? 'contracts' : 'contracts_rbac'
}

export const getContractFromSlug = async (
  contractSlug: string,
  db: SupabaseClient,
  isAdmin?: boolean
) => {
  const { data } = await run(
    db
      .from(getContractDb(isAdmin))
      .select('data')
      .eq('slug', contractSlug)
      .maybeSingle()
  )
  return data ? (data.data as Contract) : null
}

export const getContracts = async (
  contractIds: string[],
  db: SupabaseClient,
  isAdmin?: boolean
) => {
  if (contractIds.length === 0) {
    return [] as Contract[]
  }
  const chunks = chunk(contractIds, 300)
  const promises = chunks.map((chunk) =>
    run(selectJson(db, getContractDb(isAdmin)).in('id', chunk))
  )
  const results = await Promise.all(promises)
  return results.flatMap((result) => result.data.map((r) => r.data))
}

export const getUnresolvedContractsCount = async (
  creatorId: string,
  db: SupabaseClient,
  isAdmin?: boolean
) => {
  const { count } = await run(
    db
      .from(getContractDb(isAdmin))
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
  db: SupabaseClient,
  isAdmin?: boolean
) => {
  const { count } = await run(
    db
      .from(getContractDb(isAdmin))
      .select('*', { head: true, count: 'exact' })
      .eq('creator_id', creatorId)
      .gte('created_time', millisToTs(startDate))
  )
  return count
}
