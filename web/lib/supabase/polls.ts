import { run } from 'common/supabase/utils'
import { db } from './db'

// Returns all option IDs the user voted for
// For single-vote polls, this returns the single ID
// For multi-select/ranked-choice, returns all selected option IDs
export async function getUserVote(
  contractId: string,
  userId: string
): Promise<string | string[] | null> {
  const { data } = await run(
    db
      .from('votes')
      .select('id')
      .eq('contract_id', contractId)
      .eq('user_id', userId)
  )
  if (data.length === 0) {
    return null
  } else if (data.length === 1) {
    return data[0].id
  } else {
    // Multiple votes (multi-select or ranked-choice)
    return data.map((d) => d.id)
  }
}
