import { APIError, APIHandler } from 'api/helpers/endpoint'
import { PendingClarification } from 'common/pending-clarification'
import { tsToMillis } from 'common/supabase/utils'
import { applyClarificationToContract } from 'shared/apply-clarification'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getContract } from 'shared/utils'

export const getPendingClarifications: APIHandler<
  'get-pending-clarifications'
> = async (props) => {
  const { contractId } = props
  const pg = createSupabaseDirectClient()

  const rows = await pg.manyOrNone(
    `select id, contract_id, comment_id, created_time, data, applied_time, cancelled_time
     from pending_clarifications
     where contract_id = $1
       and applied_time is null
       and cancelled_time is null
     order by created_time desc`,
    [contractId]
  )

  return rows.map((r) => ({
    id: r.id,
    contractId: r.contract_id,
    commentId: r.comment_id,
    createdTime: tsToMillis(r.created_time),
    data: r.data,
  })) as PendingClarification[]
}

export const applyPendingClarification: APIHandler<
  'apply-pending-clarification'
> = async (props, auth) => {
  const { clarificationId } = props
  const pg = createSupabaseDirectClient()

  // Get the pending clarification
  const clarification = await pg.oneOrNone<{
    id: number
    contract_id: string
    comment_id: string
    data: { markdown: string }
    applied_time: string | null
    cancelled_time: string | null
  }>(
    `select id, contract_id, comment_id, data, applied_time, cancelled_time
     from pending_clarifications
     where id = $1`,
    [clarificationId]
  )

  if (!clarification) {
    throw new APIError(404, 'Pending clarification not found')
  }

  if (clarification.applied_time || clarification.cancelled_time) {
    throw new APIError(400, 'Clarification has already been processed')
  }

  // Get the contract
  const contract = await getContract(pg, clarification.contract_id)
  if (!contract) {
    throw new APIError(404, 'Contract not found')
  }

  // Check if user is the creator
  if (auth.uid !== contract.creatorId) {
    throw new APIError(403, 'Only the market creator can apply clarifications')
  }

  // Apply the clarification (returns false if already in description)
  const applied = await applyClarificationToContract(
    pg,
    contract,
    clarification.comment_id,
    clarification.data.markdown
  )

  // Mark as applied regardless (either we just applied it, or it was already applied)
  await pg.none(
    `update pending_clarifications
     set applied_time = now()
     where id = $1`,
    [clarificationId]
  )

  return { success: true, alreadyApplied: !applied }
}

export const cancelPendingClarification: APIHandler<
  'cancel-pending-clarification'
> = async (props, auth) => {
  const { clarificationId } = props
  const pg = createSupabaseDirectClient()

  // Get the pending clarification
  const clarification = await pg.oneOrNone<{
    id: number
    contract_id: string
    applied_time: string | null
    cancelled_time: string | null
  }>(
    `select id, contract_id, applied_time, cancelled_time
     from pending_clarifications
     where id = $1`,
    [clarificationId]
  )

  if (!clarification) {
    throw new APIError(404, 'Pending clarification not found')
  }

  if (clarification.applied_time || clarification.cancelled_time) {
    throw new APIError(400, 'Clarification has already been processed')
  }

  // Get the contract
  const contract = await getContract(pg, clarification.contract_id)
  if (!contract) {
    throw new APIError(404, 'Contract not found')
  }

  // Check if user is the creator
  if (auth.uid !== contract.creatorId) {
    throw new APIError(403, 'Only the market creator can cancel clarifications')
  }

  // Mark as cancelled
  await pg.none(
    `update pending_clarifications
     set cancelled_time = now()
     where id = $1`,
    [clarificationId]
  )

  return { success: true }
}
