import { APIError, APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log, getUser } from 'shared/utils'
import { isAdminId, isModId } from 'common/envs/constants'
import { insertNotificationToSupabase } from 'shared/supabase/notifications'
import { Notification } from 'common/notification'
import { randomString } from 'common/util/random'

export const denyPendingAnswer: APIHandler<
  'pending-answer/:id/deny'
> = async (props, auth) => {
  const { id } = props

  const pg = createSupabaseDirectClient()

  // Get pending answer
  const pendingAnswer = await pg.oneOrNone(
    `select * from pending_answers where id = $1`,
    [id]
  )

  if (!pendingAnswer) {
    throw new APIError(404, 'Pending answer not found')
  }

  if (pendingAnswer.status !== 'pending') {
    throw new APIError(400, 'This answer has already been reviewed')
  }

  // Get contract
  const contract = await pg.oneOrNone(
    `select data from contracts where id = $1`,
    [pendingAnswer.contract_id]
  )

  if (!contract) {
    throw new APIError(404, 'Contract not found')
  }

  const contractData = contract.data

  // Only creator, admins, and mods can deny
  if (
    auth.uid !== contractData.creatorId &&
    !isAdminId(auth.uid) &&
    !isModId(auth.uid)
  ) {
    throw new APIError(403, 'Only the market creator can deny answers')
  }

  // Mark pending answer as denied
  await pg.none(
    `update pending_answers
     set status = 'denied', reviewed_by = $1, reviewed_time = now()
     where id = $2`,
    [auth.uid, id]
  )

  // Create notification for submitter
  const reviewer = await getUser(auth.uid)
  if (reviewer) {
    const notification: Notification = {
      id: randomString(),
      userId: pendingAnswer.user_id,
      reasonText: 'Your answer was not approved',
      reason: 'comment_on_your_contract', // Reusing existing notification type for generic message
      createdTime: Date.now(),
      isSeen: false,
      sourceId: id,
      sourceType: 'comment',
      sourceContractId: contractData.id,
      sourceUserName: reviewer.name,
      sourceUserUsername: reviewer.username,
      sourceUserAvatarUrl: reviewer.avatarUrl,
      sourceText: `Your proposed answer "${pendingAnswer.text}" was not approved for this market.`,
      sourceContractCreatorUsername: contractData.creatorUsername,
      sourceContractTitle: contractData.question,
      sourceContractSlug: contractData.slug,
      sourceSlug: contractData.slug,
    }
    await insertNotificationToSupabase(notification, pg)
  }

  log('Denied pending answer', {
    pendingAnswerId: id,
    contractId: pendingAnswer.contract_id,
    submitterId: pendingAnswer.user_id,
    reviewerId: auth.uid,
  })
}
