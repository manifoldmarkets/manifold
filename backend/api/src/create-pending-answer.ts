import { APIError, APIHandler } from './helpers/endpoint'
import { MAX_ANSWER_LENGTH } from 'common/answer'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import { isAdminId } from 'common/envs/constants'

export const createPendingAnswer: APIHandler<
  'market/:contractId/pending-answer'
> = async (props, auth) => {
  const { contractId, text } = props

  if (text.length > MAX_ANSWER_LENGTH) {
    throw new APIError(400, 'Answer text too long')
  }

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

  // Check if this is a multi-choice contract
  if (contractData.mechanism !== 'cpmm-multi-1') {
    throw new APIError(400, 'Contract must be a multiple choice market')
  }

  // Check if contract is still open
  if (contractData.isResolved || contractData.closeTime < Date.now()) {
    throw new APIError(403, 'Market is closed or resolved')
  }

  // Check if addAnswersMode is APPROVAL_REQUIRED
  if (contractData.addAnswersMode !== 'APPROVAL_REQUIRED') {
    throw new APIError(
      400,
      'This market does not require approval for answers. Use the regular answer endpoint instead.'
    )
  }

  // If ONLY_CREATOR mode, verify user is creator or admin
  if (contractData.addAnswersMode === 'ONLY_CREATOR') {
    if (auth.uid !== contractData.creatorId && !isAdminId(auth.uid)) {
      throw new APIError(403, 'Only the market creator can add answers')
    }
  }

  // Check for duplicate pending answer from this user
  const existingPending = await pg.oneOrNone(
    `select id from pending_answers
     where contract_id = $1 and user_id = $2 and text = $3 and status = 'pending'`,
    [contractId, auth.uid, text]
  )

  if (existingPending) {
    throw new APIError(
      400,
      'You already have a pending answer with this text for this market'
    )
  }

  // Check for duplicate in existing answers
  const existingAnswer = await pg.oneOrNone(
    `select id from answers where contract_id = $1 and text = $2`,
    [contractId, text]
  )

  if (existingAnswer) {
    throw new APIError(400, 'An answer with this text already exists')
  }

  // Insert pending answer
  const result = await pg.one(
    `insert into pending_answers (contract_id, user_id, text, status, created_time)
     values ($1, $2, $3, 'pending', now())
     returning id`,
    [contractId, auth.uid, text]
  )

  log('Created pending answer', {
    pendingAnswerId: result.id,
    contractId,
    userId: auth.uid,
    text,
  })

  return { pendingAnswerId: result.id }
}
