import { createSupabaseClient } from 'shared/supabase/init'
import { APIHandler } from './helpers/endpoint'
import { getTopicsOnContract } from 'common/supabase/groups'

export const getContractTopics: APIHandler<
  'market/:contractId/groups'
> = async ({ contractId }) => {
  const db = createSupabaseClient()
  return getTopicsOnContract(contractId, db)
}
