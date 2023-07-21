import { run } from 'common/supabase/utils'
import { db } from './db'

export async function getHasVoted(contractId: string, userId: string) {
  const { data } = await run(
    db
      .from('votes')
      .select('*')
      .eq('contract_id', contractId)
      .eq('user_id', userId)
  )
  if (data.length > 0) {
    return true
  }
  return false
}
