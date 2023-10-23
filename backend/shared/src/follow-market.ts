import { createSupabaseClient } from 'shared/supabase/init'
import { followContract, unfollowContract } from 'common/supabase/contracts'

export const addUserToContractFollowers = async (
  contractId: string,
  userId: string
) => {
  const db = createSupabaseClient()
  return followContract(db, contractId, userId)
}

export const removeUserFromContractFollowers = async (
  contractId: string,
  userId: string
) => {
  const db = createSupabaseClient()
  return unfollowContract(db, contractId, userId)
}
