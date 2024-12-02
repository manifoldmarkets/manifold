import { APIHandler } from './helpers/endpoint'
import { getAnswersForContract } from 'shared/supabase/answers'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getContractAnswers: APIHandler<'market/:contractId/answers'> = async (props) => {
  const pg = createSupabaseDirectClient()
  return await getAnswersForContract(pg, props.contractId)
}
