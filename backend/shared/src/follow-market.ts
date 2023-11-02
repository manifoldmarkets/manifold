import { createSupabaseClient } from 'shared/supabase/init'
import { followContract } from 'common/supabase/contracts'

export const addUserToContractFollowers = async (
  contractId: string,
  userId: string
) => {
  const db = createSupabaseClient()
  return followContract(db, contractId, userId)
}
