import { run } from 'common/supabase/utils'
import { db } from './db'

export async function getUserVote(
  contractId: string,
  userId: string
): Promise<string | null> {
  const { data } = await run(
    db
      .from('votes')
      .select('id')
      .eq('contract_id', contractId)
      .eq('user_id', userId)
  )
  if (data.length > 0) {
    return data[0].id
  } else {
    return null
  }
}
