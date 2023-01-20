import { run, selectJson } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { Contract } from 'common/contract'
import { chunk } from 'lodash'

export const getContracts = async (contractIds: string[]) => {
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
