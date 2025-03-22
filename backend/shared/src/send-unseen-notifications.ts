import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import { createPushNotifications } from 'shared/create-push-notifications'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { PrivateUser } from 'common/user'
import { Notification } from 'common/notification'

// TODO: if we want to send these/check more often, we need to save rows
//  to the market_movement_notifications table with 'mobile' destination
export async function sendUnseenMarketMovementPushNotifications() {
  const pg = createSupabaseDirectClient()

  const results = await pg.manyOrNone(`
    with user_unseen_notifications as (
        select
          n.data as notification,
          pu.data as private_user,
          row_number() over (partition by n.user_id order by c.importance_score desc) as importance_rank
        from contract_movement_notifications cmn
          join user_notifications n on n.notification_id = cmn.notification_id
          join private_users pu on n.user_id = pu.id
          join contracts c on cmn.contract_id = c.id
        where cmn.destination = 'browser'
          and cmn.created_time > now() - interval '24 hours'
          and n.data->>'isSeen' = 'false'
          and c.resolution is null
    )
    select * from user_unseen_notifications
    where importance_rank = 1
  `)

  if (results.length === 0) {
    log('No unseen market movement notifications to process')
    return
  }

  log(`Found ${results.length} users with unseen market movement notifications`)

  // Prepare notifications for sending
  const notificationsToSend: [PrivateUser, Notification, string, string][] = []

  for (const result of results) {
    const privateUser = result.private_user as PrivateUser
    const notification = result.notification as Notification

    const { sendToMobile } = getNotificationDestinationsForUser(
      privateUser,
      notification.reason
    )

    if (!sendToMobile) continue
    const { sourceContractTitle: question, data } = notification
    const startProb = data?.val_start ?? 0
    const endProb = data?.val_end ?? 0
    const answerText = data?.answerText

    const startProbText = `${Math.round(startProb * 100)}%`
    const endProbText = `${Math.round(endProb * 100)}%`

    // Basic title/body for the notification
    const questionText = truncateText(question, answerText ? 70 : 130)
    const answer = answerText ? `:\n${truncateText(answerText, 60)}` : ''
    const title = 'Market movement'
    const body = `${questionText}${answer}: ${startProbText} → ${endProbText}`

    notificationsToSend.push([privateUser, notification, title, body])
  }

  if (notificationsToSend.length === 0) {
    log('No notifications to send after filtering')
    return
  }

  log(`Sending ${notificationsToSend.length} push notifications`)
  await createPushNotifications(notificationsToSend)
}

export function truncateText(text: string | undefined, slice: number) {
  if (!text) {
    return text
  }
  if (text.length <= slice + 3) {
    return text
  }
  return text.slice(0, slice) + '...'
}
