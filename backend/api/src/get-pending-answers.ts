import { APIError, APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { isAdminId, isModId } from 'common/envs/constants'

export const getPendingAnswers: APIHandler<
  'market/:contractId/pending-answers'
> = async (props, auth) => {
  const { contractId } = props

  const pg = createSupabaseDirectClient()

  // Get contract
  const contract = await pg.oneOrNone(
    `select data from contracts where id = $1`,
    [contractId]
  )

  if (!contract) {
    throw new APIError(404, 'Contract not found')
  }

  const contractData = contract.data

  // Only creator, admins, and mods can view pending answers
  if (
    auth.uid !== contractData.creatorId &&
    !isAdminId(auth.uid) &&
    !isModId(auth.uid)
  ) {
    throw new APIError(403, 'Only the market creator can view pending answers')
  }

  // Get all pending answers for this contract
  const pendingAnswers = await pg.many(
    `select id, contract_id, user_id, text, created_time, status
     from pending_answers
     where contract_id = $1 and status = 'pending'
     order by created_time asc`,
    [contractId]
  )

  return pendingAnswers.map((pa) => ({
    id: pa.id,
    contractId: pa.contract_id,
    userId: pa.user_id,
    text: pa.text,
    createdTime: new Date(pa.created_time).getTime(),
    status: pa.status,
  }))
}
