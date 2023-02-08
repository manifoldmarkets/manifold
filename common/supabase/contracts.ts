import { chunk } from 'lodash'
import { run, selectJson, SupabaseClient } from './utils'
import { Contract } from '../contract'

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

export const getUnresolvedContracts = async (
  creatorId: string,
  db: SupabaseClient
) => {
  const { count } = await run(
    db
      .from('contracts')
      .select('*', { head: true, count: 'exact' })
      .contains('data', {
        creatorId: creatorId,
        isResolved: false,
      })
      .lt('data->>closeTime', Date.now())
  )
  return count
}
