import { run } from 'common/supabase/utils'
import { db } from './db'

export async function getContractFollows(contractId: string) {
  const { data } = await run(
    db
      .from('contract_follows')
      .select('follow_id')
      .eq('contract_id', contractId)
  )
  if (data && data.length > 0) {
    return data.map((d) => d.follow_id as string)
  } else {
    return []
  }
}
