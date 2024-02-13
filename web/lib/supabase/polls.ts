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

export async function getContractVoters(contractId: string) {
  const { data } = await db
    .from('votes')
    .select('user_id')
    .eq('contract_id', contractId)

  if (data && data.length > 0) {
    return data.map((d) => d.user_id)
  }

  return []
}

export async function getOptionVoters(contractId: string, optionId: string) {
  const { data } = await db
    .from('votes')
    .select('user_id')
    .eq('contract_id', contractId)
    .eq('option_id', optionId)

  if (data && data.length > 0) {
    return data.map((d) => d.user_id)
  }
  return []
}
