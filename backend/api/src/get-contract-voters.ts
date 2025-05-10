import { APIError, APIHandler, AuthedUser } from 'api/helpers/endpoint'
import { convertUser, prefixedDisplayUserColumns } from 'common/supabase/users'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getContract } from 'shared/utils'
import { PollContract } from 'common/contract'

export const getContractVoters: APIHandler<'get-contract-voters'> = async (
  props,
  auth
) => {
  const { contractId } = props
  const pg = createSupabaseDirectClient()
  await checkAccess(contractId, auth)
  return await pg.map(
    `select ${prefixedDisplayUserColumns} from users u
     join votes on votes.user_id = u.id where votes.contract_id = $1`,
    [contractId],
    convertUser
  )
}
const checkAccess = async (contractId: string, auth: AuthedUser) => {
  const pg = createSupabaseDirectClient()
  const contract = (await getContract(pg, contractId)) as PollContract
  if (!contract) {
    throw new APIError(404, 'Contract not found')
  }
  const isCreator = auth.uid === contract.creatorId
  const canShowVoters =
    !contract.voterVisibility ||
    contract.voterVisibility === 'everyone' ||
    (contract.voterVisibility === 'creator' && isCreator)
  if (!canShowVoters) {
    throw new APIError(403, 'You are not allowed to see the voters')
  }
}
export const getContractOptionVoters: APIHandler<
  'get-contract-option-voters'
> = async (props, auth) => {
  const { contractId, optionId } = props
  const pg = createSupabaseDirectClient()
  await checkAccess(contractId, auth)
  return await pg.map(
    `select ${prefixedDisplayUserColumns} from users u
     join votes on votes.user_id = u.id where votes.contract_id = $1 and votes.id = $2`,
    [contractId, optionId],
    convertUser
  )
}
