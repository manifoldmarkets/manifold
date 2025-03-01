import { APIHandler } from 'api/helpers/endpoint'
import { convertUser, prefixedDisplayUserColumns } from 'common/supabase/users'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getContractVoters: APIHandler<'get-contract-voters'> = async (
  props
) => {
  const { contractId } = props
  const pg = createSupabaseDirectClient()

  return await pg.map(
    `select ${prefixedDisplayUserColumns} from users u
     join votes on votes.user_id = u.id where votes.contract_id = $1`,
    [contractId],
    convertUser
  )
}

export const getContractOptionVoters: APIHandler<
  'get-contract-option-voters'
> = async (props) => {
  const { contractId, optionId } = props
  const pg = createSupabaseDirectClient()

  return await pg.map(
    `select ${prefixedDisplayUserColumns} from users u
     join votes on votes.user_id = u.id where votes.contract_id = $1 and votes.id = $2`,
    [contractId, optionId],
    convertUser
  )
}
